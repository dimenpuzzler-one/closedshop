import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logServerEvent } from '@closed-commerce/observability';
import { ApiError, demoResponse, failFromSupabase, withAdminParams } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Vercel 서버리스 요청 본문 한도(4.5MB)보다 아래로 잡는다. 등록 API와 같은 기준. */
const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 9;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 상품 등록 후 사진만 추가한다. 사진을 바꾸려면 지우고 다시 올리면 된다. */
export const POST = withAdminParams<{ id: string }>(
  'admin.products.images.add',
  async ({ requestId, client, userId }, request, { id }) => {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new ApiError(400, '이미지는 파일 업로드 형식으로 보내야 합니다.', 'expected_multipart');
    }

    const { data: product, error: readError } = await client.from('products').select('id, name').eq('id', id).maybeSingle();
    if (readError) failFromSupabase('상품을 조회하지 못했습니다.', readError, 'product_read_failed');
    if (!product) throw new ApiError(404, `상품을 찾을 수 없습니다: ${id}`, 'product_not_found');

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new ApiError(
        413,
        `이미지 업로드가 중단됐습니다. 총 용량이 ${formatMb(MAX_TOTAL_UPLOAD_BYTES)}를 넘지 않는지 확인해 주세요.`,
        'form_parse_failed',
        error instanceof Error ? error.message : String(error),
      );
    }

    const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) throw new ApiError(400, '추가할 이미지를 선택해 주세요.', 'no_images');

    const badType = files.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
    if (badType) {
      throw new ApiError(
        400,
        `이미지는 JPG, PNG, WEBP만 등록할 수 있습니다. "${badType.name}"의 형식은 ${badType.type || '알 수 없음'}입니다.`,
        'unsupported_image_type',
      );
    }
    const tooLarge = files.find((file) => file.size > MAX_IMAGE_BYTES);
    if (tooLarge) {
      throw new ApiError(400, `"${tooLarge.name}"이 ${formatMb(tooLarge.size)}입니다. 한 장은 ${formatMb(MAX_IMAGE_BYTES)} 이하여야 합니다.`, 'image_too_large');
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      throw new ApiError(400, `선택한 ${files.length}장의 합계가 ${formatMb(total)}입니다. ${formatMb(MAX_TOTAL_UPLOAD_BYTES)} 이하로 줄여 주세요.`, 'upload_total_too_large');
    }

    const { data: existing, error: existingError } = await client
      .from('product_images')
      .select('id, sort_order')
      .eq('product_id', id)
      .order('sort_order', { ascending: false });
    if (existingError) failFromSupabase('기존 이미지를 확인하지 못했습니다.', existingError, 'image_read_failed');

    const currentCount = existing?.length ?? 0;
    if (currentCount + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new ApiError(
        400,
        `상품 한 개에 사진은 최대 ${MAX_IMAGES_PER_PRODUCT}장입니다. 지금 ${currentCount}장이 있어 ${MAX_IMAGES_PER_PRODUCT - currentCount}장만 더 넣을 수 있습니다.`,
        'too_many_images',
      );
    }

    let nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;
    const uploaded: { storagePath: string; sortOrder: number }[] = [];
    for (const file of files) {
      const storagePath = `${id}/${String(nextSortOrder).padStart(2, '0')}-${randomUUID()}.${extensionFor(file.type)}`;
      const { error: uploadError } = await client.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (uploadError) {
        // 이번 요청에서 올린 것만 되돌린다. 기존 사진은 건드리지 않는다.
        if (uploaded.length) await client.storage.from(IMAGE_BUCKET).remove(uploaded.map((item) => item.storagePath));
        failFromSupabase(`"${file.name}" 업로드에 실패했습니다.`, uploadError, 'storage_upload_failed');
      }
      uploaded.push({ storagePath, sortOrder: nextSortOrder });
      nextSortOrder += 1;
    }

    const { error: rowError } = await client.from('product_images').insert(
      uploaded.map((item) => ({ product_id: id, storage_path: item.storagePath, alt_text: product.name, sort_order: item.sortOrder })),
    );
    if (rowError) {
      await client.storage.from(IMAGE_BUCKET).remove(uploaded.map((item) => item.storagePath));
      failFromSupabase('이미지 정보를 저장하지 못했습니다.', rowError, 'image_row_insert_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_images_added',
      entity_type: 'product',
      entity_id: id,
      after_data: { count: uploaded.length, requestId },
    });
    logServerEvent('admin.products.images.add', requestId, { stage: 'done', productId: id, count: uploaded.length });
    return NextResponse.json({ message: `사진 ${uploaded.length}장을 추가했습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '사진이 추가되었습니다.' }) },
);
