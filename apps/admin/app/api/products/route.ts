import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { productCreateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

const IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadCandidate = { file: File; sortOrder: number };

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
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

function validateImages(images: UploadCandidate[]) {
  if (images.filter((image) => image.sortOrder > 0).length > 8) return '상세 이미지는 최대 8장까지 등록할 수 있습니다.';
  const invalid = images.find(({ file }) => file.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.has(file.type));
  if (!invalid) return undefined;
  if (!ALLOWED_IMAGE_TYPES.has(invalid.file.type)) return '이미지는 JPG, PNG, WEBP 파일만 등록할 수 있습니다.';
  return '이미지 파일은 5MB 이하만 등록할 수 있습니다.';
}

async function parseRequest(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) return { values: await request.json() as Record<string, unknown>, images: [] as UploadCandidate[] };
  const formData = await request.formData();
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) if (typeof value === 'string') values[key] = value;
  for (const key of ['basePrice', 'supplyCost', 'shippingFee', 'optionPrice', 'stock']) {
    if (values[key] === '') delete values[key];
    else if (values[key] !== undefined) values[key] = Number(values[key]);
  }
  return { values, images: getUploadCandidates(formData) };
}

async function removeUploadedImages(client: { storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<unknown> } } }, paths: string[]) {
  if (paths.length) await client.storage.from(IMAGE_BUCKET).remove(paths);
}

export async function POST(request: Request) {
  const { values, images } = await parseRequest(request);
  const imageError = validateImages(images);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
  const parsed = productCreateSchema.safeParse(values);
  if (!parsed.success) return NextResponse.json({ error: '상품 입력값이 올바르지 않습니다.', details: parsed.error.flatten() }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 상품 등록이 처리되었습니다.', productId: `demo-${Date.now()}` });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });

  const { data: product, error: productError } = await context.client.from('products').insert({ slug: parsed.data.slug, name: parsed.data.name, category: parsed.data.category, short_description: parsed.data.shortDescription, description: parsed.data.description, base_price: parsed.data.basePrice, supply_cost: parsed.data.supplyCost, shipping_fee: parsed.data.shippingFee, visibility: parsed.data.visibility, status: parsed.data.status }).select('id').single();
  if (productError || !product) return NextResponse.json({ error: productError?.code === '23505' ? '이미 사용 중인 상품 slug입니다.' : '상품을 저장하지 못했습니다.' }, { status: 500 });

  const cleanup = async (paths: string[] = []) => {
    await removeUploadedImages(context.client, paths);
    await context.client.from('products').delete().eq('id', product.id);
  };
  const { error: optionError } = await context.client.from('product_options').insert({ product_id: product.id, name: parsed.data.optionName, value: parsed.data.optionValue, price: parsed.data.optionPrice ?? parsed.data.basePrice });
  if (optionError) { await cleanup(); return NextResponse.json({ error: '상품 옵션을 저장하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 }); }
  const { error: inventoryError } = await context.client.from('inventory').insert({ product_id: product.id, quantity: parsed.data.stock, reserved_quantity: 0 });
  if (inventoryError) { await cleanup(); return NextResponse.json({ error: '재고를 저장하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 }); }

  const uploadedImages: { storagePath: string; sortOrder: number }[] = [];
  for (const image of images) {
    const storagePath = `${product.id}/${String(image.sortOrder).padStart(2, '0')}-${randomUUID()}.${extensionFor(image.file.type)}`;
    const { error: uploadError } = await context.client.storage.from(IMAGE_BUCKET).upload(storagePath, Buffer.from(await image.file.arrayBuffer()), { contentType: image.file.type, upsert: false });
    if (uploadError) {
      await cleanup(uploadedImages.map((uploaded) => uploaded.storagePath));
      return NextResponse.json({ error: '상품 이미지를 업로드하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 });
    }
    uploadedImages.push({ storagePath, sortOrder: image.sortOrder });
  }
  if (uploadedImages.length) {
    const { error: imageRowError } = await context.client.from('product_images').insert(uploadedImages.map((image) => ({ product_id: product.id, storage_path: image.storagePath, alt_text: parsed.data.name, sort_order: image.sortOrder })));
    if (imageRowError) {
      await cleanup(uploadedImages.map((uploaded) => uploaded.storagePath));
      return NextResponse.json({ error: '상품 이미지 정보를 저장하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 });
    }
  }
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'product_created', entity_type: 'product', entity_id: product.id, after_data: { ...parsed.data, imageCount: uploadedImages.length } });
  return NextResponse.json({ message: `상품이 등록되었습니다${uploadedImages.length ? ` (이미지 ${uploadedImages.length}장 포함)` : ''}.`, productId: product.id });
}
