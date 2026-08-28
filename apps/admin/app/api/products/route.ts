import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logServerEvent } from '@closed-commerce/observability';
import { nextSlugCandidate, productCreateSchema, slugify } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, withAdmin, type AdminRouteContext } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/**
 * Vercel 서버리스 함수의 요청 본문 한도는 4.5MB다.
 * 예전 코드는 파일당 5MB × 9장(=45MB)을 허용한다고 써놓았지만,
 * 실제로는 4.5MB를 넘는 순간 함수가 실행되기도 전에 플랫폼이 413을 반환했다.
 * (그래서 Supabase 로그에 요청이 아예 남지 않았다.)
 * 여기서 한도를 플랫폼 현실에 맞추고, 넘어가면 이유를 분명히 알려준다.
 */
const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DETAIL_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadCandidate = { file: File; sortOrder: number };

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 관리자가 slug 규칙을 몰라도 상품을 등록할 수 있도록 서버에서 정리한다.
 *
 * 1) 직접 입력한 값이 있으면 그것을 정리한다. "Gift Set 500g" -> "gift-set-500g"
 * 2) 없으면 상품명에서 만든다. 한글은 자모 단위로 로마자 표기하므로
 *    "한우 육포 선물세트 300g" -> "hanu-yukpo-seonmulseteu-300g"가 되어
 *    주소만 봐도 어떤 상품인지 알 수 있다.
 * 3) 둘 다 쓸 수 없을 때만(기호뿐인 이름 등) 임의 값으로 떨어진다.
 */
function normalizeSlug(value: unknown, name: unknown): string {
  const fromValue = typeof value === 'string' ? slugify(value) : '';
  if (fromValue) return fromValue;
  const fromName = typeof name === 'string' ? slugify(name) : '';
  if (fromName) return fromName;
  return `product-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function getUploadCandidates(formData: FormData) {
  const thumbnail = formData.get('thumbnail');
  const detailImages = formData.getAll('detailImages');
  const candidates: UploadCandidate[] = [];
  if (thumbnail instanceof File && thumbnail.size > 0) candidates.push({ file: thumbnail, sortOrder: 0 });
  detailImages.forEach((entry, index) => {
    if (entry instanceof File && entry.size > 0) candidates.push({ file: entry, sortOrder: index + 1 });
  });
  return candidates;
}

function assertImagesAreUploadable(images: UploadCandidate[]) {
  const detailCount = images.filter((image) => image.sortOrder > 0).length;
  if (detailCount > MAX_DETAIL_IMAGES) {
    throw new ApiError(400, `상세 이미지는 최대 ${MAX_DETAIL_IMAGES}장까지 등록할 수 있습니다. (선택: ${detailCount}장)`, 'too_many_images');
  }

  const badType = images.find(({ file }) => !ALLOWED_IMAGE_TYPES.has(file.type));
  if (badType) {
    throw new ApiError(
      400,
      `이미지는 JPG, PNG, WEBP만 등록할 수 있습니다. "${badType.file.name}"의 형식은 ${badType.file.type || '알 수 없음'}입니다. (아이폰 HEIC 사진이면 JPG로 변환해 주세요.)`,
      'unsupported_image_type',
    );
  }

  const tooLarge = images.find(({ file }) => file.size > MAX_IMAGE_BYTES);
  if (tooLarge) {
    throw new ApiError(
      400,
      `이미지 한 장은 ${formatMb(MAX_IMAGE_BYTES)} 이하만 등록할 수 있습니다. "${tooLarge.file.name}"은 ${formatMb(tooLarge.file.size)}입니다.`,
      'image_too_large',
    );
  }

  const total = images.reduce((sum, image) => sum + image.file.size, 0);
  if (total > MAX_TOTAL_UPLOAD_BYTES) {
    throw new ApiError(
      400,
      `한 번에 올릴 수 있는 이미지 총합은 ${formatMb(MAX_TOTAL_UPLOAD_BYTES)}입니다. 지금 선택한 ${images.length}장의 합계는 ${formatMb(total)}입니다. 장수를 줄이거나 사진 크기를 줄여 주세요.`,
      'upload_total_too_large',
    );
  }
  return total;
}

async function parseRequest(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    try {
      return { values: (await request.json()) as Record<string, unknown>, images: [] as UploadCandidate[] };
    } catch {
      throw new ApiError(400, '요청 본문을 읽지 못했습니다(JSON 형식이 아닙니다).', 'invalid_json');
    }
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    // 업로드가 중간에 끊기거나 플랫폼 한도를 넘으면 여기서 터진다.
    throw new ApiError(
      413,
      `이미지 업로드가 중단됐습니다. 총 용량이 ${formatMb(MAX_TOTAL_UPLOAD_BYTES)}를 넘지 않는지 확인해 주세요.`,
      'form_parse_failed',
      error instanceof Error ? error.message : String(error),
    );
  }
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) if (typeof value === 'string') values[key] = value;
  for (const key of ['basePrice', 'supplyCost', 'shippingFee', 'optionPrice', 'stock']) {
    const raw = values[key];
    if (raw === '' || raw === undefined) {
      delete values[key];
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      throw new ApiError(400, `숫자 항목 "${key}"에 숫자가 아닌 값이 들어왔습니다: ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`, 'invalid_number');
    }
    values[key] = numeric;
  }
  return { values, images: getUploadCandidates(formData) };
}

async function removeUploadedImages(client: AdminRouteContext['client'], paths: string[]) {
  if (paths.length) await client.storage.from(IMAGE_BUCKET).remove(paths);
}

export const POST = withAdmin(
  'admin.products.create',
  async ({ requestId, client, userId }, request) => {
    // 인증이 끝난 뒤에야 본문을 읽는다. 예전에는 파싱이 먼저라
    // 비인증 요청도 서버가 파일을 통째로 버퍼링했다.
    const { values, images } = await parseRequest(request);
    const totalBytes = assertImagesAreUploadable(images);

    // 운영자가 URL 규칙을 알아야 할 이유가 없다.
    // 직접 입력했으면 그 값을 정리해서 쓰고("Gift Set" -> "gift-set"),
    // 비웠으면 상품명에서 만든다("한우 육포 300g" -> "hanu-yukpo-300g").
    const providedSlug = typeof values.slug === 'string' ? values.slug.trim() : '';
    const autoSlug = slugify(providedSlug).length === 0;
    values.slug = normalizeSlug(values.slug, values.name);
    const parsed = productCreateSchema.safeParse(values);
    if (!parsed.success) {
      // 메시지 본문은 기본 문구만 두고, 항목별 사유는 details로 보낸다.
      // 예전에는 양쪽에 다 넣어 화면에 "slug: Invalid slug: Invalid"처럼 두 번 찍혔다.
      throw new ApiError(400, '상품 입력값이 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }
    const productSlug = parsed.data.slug ?? `item-${Date.now().toString(36)}`;

    logServerEvent('admin.products.create', requestId, {
      stage: 'validated',
      slug: productSlug,
      autoSlug,
      imageCount: images.length,
      uploadBytes: totalBytes,
    });

    const insertProduct = (slug: string) =>
      client
        .from('products')
        .insert({
          slug,
          name: parsed.data.name,
          category: parsed.data.category,
          short_description: parsed.data.shortDescription,
          description: parsed.data.description,
          base_price: parsed.data.basePrice,
          supply_cost: parsed.data.supplyCost ?? null,
          shipping_fee: parsed.data.shippingFee,
          // 비워두면 개봉한 식품도 환불해줘야 한다(전자상거래법 제17조 제2항 단서).
          withdrawal_restriction: parsed.data.withdrawalRestriction,
          visibility: parsed.data.visibility,
          status: parsed.data.status,
        })
        .select('id, slug')
        .single();

    let slugToUse = productSlug;
    let inserted = await insertProduct(slugToUse);

    // 자동 생성 slug는 같은 상품명이면 당연히 겹친다. 운영자에게 물어볼 일이 아니라 번호를 올린다.
    for (let attempt = 0; autoSlug && inserted.error?.code === '23505' && attempt < 20; attempt += 1) {
      slugToUse = nextSlugCandidate(slugToUse);
      inserted = await insertProduct(slugToUse);
    }

    const product = inserted.data;
    if (inserted.error || !product) {
      if (inserted.error?.code === '23505') {
        throw new ApiError(
          409,
          `상품 주소(slug) "${slugToUse}"는 이미 다른 상품이 쓰고 있습니다. 뒤에 숫자를 붙이거나 비워 두시면 자동으로 만들어 드립니다.`,
          'duplicate_slug',
          { slug: slugToUse, suggestion: nextSlugCandidate(slugToUse) },
        );
      }
      failFromSupabase('상품을 저장하지 못했습니다.', inserted.error, 'product_insert_failed');
    }

    const cleanup = async (paths: string[] = []) => {
      await removeUploadedImages(client, paths);
      await client.from('products').delete().eq('id', product.id);
    };

    const { error: optionError } = await client.from('product_options').insert({
      product_id: product.id,
      name: parsed.data.optionName,
      value: parsed.data.optionValue,
      price: parsed.data.optionPrice ?? parsed.data.basePrice,
    });
    if (optionError) {
      await cleanup();
      failFromSupabase('상품 옵션을 저장하지 못했습니다. 상품 등록은 취소되었습니다.', optionError, 'option_insert_failed');
    }

    const { error: inventoryError } = await client
      .from('inventory')
      .insert({ product_id: product.id, quantity: parsed.data.stock, reserved_quantity: 0 });
    if (inventoryError) {
      await cleanup();
      failFromSupabase('재고를 저장하지 못했습니다. 상품 등록은 취소되었습니다.', inventoryError, 'inventory_insert_failed');
    }

    const uploadedImages: { storagePath: string; sortOrder: number }[] = [];
    for (const image of images) {
      const storagePath = `${product.id}/${String(image.sortOrder).padStart(2, '0')}-${randomUUID()}.${extensionFor(image.file.type)}`;
      const { error: uploadError } = await client.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, Buffer.from(await image.file.arrayBuffer()), { contentType: image.file.type, upsert: false });
      if (uploadError) {
        await cleanup(uploadedImages.map((uploaded) => uploaded.storagePath));
        failFromSupabase(
          `상품 이미지("${image.file.name}")를 업로드하지 못했습니다. 상품 등록은 취소되었습니다.`,
          uploadError,
          'storage_upload_failed',
        );
      }
      uploadedImages.push({ storagePath, sortOrder: image.sortOrder });
    }

    if (uploadedImages.length) {
      const { error: imageRowError } = await client.from('product_images').insert(
        uploadedImages.map((image) => ({
          product_id: product.id,
          storage_path: image.storagePath,
          alt_text: parsed.data.name,
          sort_order: image.sortOrder,
        })),
      );
      if (imageRowError) {
        await cleanup(uploadedImages.map((uploaded) => uploaded.storagePath));
        failFromSupabase('상품 이미지 정보를 저장하지 못했습니다. 상품 등록은 취소되었습니다.', imageRowError, 'image_row_insert_failed');
      }
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_created',
      entity_type: 'product',
      entity_id: product.id,
      after_data: { ...parsed.data, slug: product.slug, autoSlug, imageCount: uploadedImages.length, requestId },
    });

    logServerEvent('admin.products.create', requestId, { stage: 'done', productId: product.id, slug: product.slug });
    return NextResponse.json({
      message: `상품이 등록되었습니다${uploadedImages.length ? ` (이미지 ${uploadedImages.length}장 포함)` : ''}. 상품 주소: ${product.slug}`,
      productId: product.id,
      slug: product.slug,
      requestId,
    });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '상품 등록이 처리되었습니다.', productId: `demo-${requestId}` }) },
);
