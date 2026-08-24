import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logServerEvent } from '@closed-commerce/observability';
import type { AdminRouteContext } from '@/lib/route-handler';
import { ApiError, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BATCH_BYTES = 200 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 21;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type RequestedFile = { name?: unknown; mimeType?: unknown; byteSize?: unknown; width?: unknown; height?: unknown };
type CompletedUpload = { path?: unknown; sortOrder?: unknown; mimeType?: unknown; byteSize?: unknown; width?: unknown; height?: unknown };

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function displayName(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function validatePath(productId: string, path: unknown): path is string {
  return typeof path === 'string'
    && path.startsWith(`${productId}/`)
    && /^[0-9a-f-]+\/[0-9]{2,3}-[0-9a-f-]+\.(?:jpg|png|webp)$/.test(path);
}

async function requireProduct(client: AdminRouteContext['client'], id: string) {
  const { data: product, error } = await client.from('products').select('id, name').eq('id', id).maybeSingle();
  if (error) failFromSupabase('상품을 조회하지 못했습니다.', error, 'product_read_failed');
  if (!product) throw new ApiError(404, `상품을 찾을 수 없습니다: ${id}`, 'product_not_found');
  return product;
}

/** Create short-lived signed destinations; file bytes never pass through Vercel. */
export const POST = withAdminParams<{ id: string }>(
  'admin.products.images.prepare',
  async ({ requestId, client }, request, { id }) => {
    await requireProduct(client, id);
    const body = await readJson(request) as { files?: unknown };
    if (!Array.isArray(body.files) || body.files.length === 0) {
      throw new ApiError(400, '추가할 이미지 정보가 없습니다.', 'no_images');
    }

    const files = body.files as RequestedFile[];
    const { data: existing, error: existingError } = await client
      .from('product_images')
      .select('id, sort_order')
      .eq('product_id', id)
      .order('sort_order', { ascending: false });
    if (existingError) failFromSupabase('기존 이미지를 확인하지 못했습니다.', existingError, 'image_read_failed');

    const currentCount = existing?.length ?? 0;
    if (currentCount + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new ApiError(400, `상품 한 개에 사진은 최대 ${MAX_IMAGES_PER_PRODUCT}장입니다. 지금 ${currentCount}장이 있어 ${MAX_IMAGES_PER_PRODUCT - currentCount}장만 더 올릴 수 있습니다.`, 'too_many_images');
    }

    let totalBytes = 0;
    const normalized = files.map((file) => {
      const mimeType = typeof file.mimeType === 'string' ? file.mimeType : '';
      const byteSize = positiveInteger(file.byteSize);
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw new ApiError(400, `JPG, PNG, WEBP 이미지만 올릴 수 있습니다. (${displayName(file.name, '이름 없음')})`, 'unsupported_image_type');
      }
      if (!byteSize) throw new ApiError(400, `이미지 용량 정보가 올바르지 않습니다. (${displayName(file.name, '이름 없음')})`, 'invalid_image_size');
      if (byteSize > MAX_IMAGE_BYTES) {
        throw new ApiError(400, `"${displayName(file.name, '이미지')}"은 ${formatMb(byteSize)}입니다. 한 장은 ${formatMb(MAX_IMAGE_BYTES)} 이하여야 합니다.`, 'image_too_large');
      }
      totalBytes += byteSize;
      return { mimeType, byteSize, width: positiveInteger(file.width), height: positiveInteger(file.height) };
    });
    if (totalBytes > MAX_UPLOAD_BATCH_BYTES) {
      throw new ApiError(400, `한 번에 올릴 수 있는 합계는 ${formatMb(MAX_UPLOAD_BATCH_BYTES)}입니다. 지금은 ${formatMb(totalBytes)}입니다.`, 'upload_batch_too_large');
    }

    const firstSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;
    const uploads = await Promise.all(normalized.map(async (file, index) => {
      const sortOrder = firstSortOrder + index;
      const path = `${id}/${String(sortOrder).padStart(2, '0')}-${randomUUID()}.${extensionFor(file.mimeType)}`;
      const { data, error } = await client.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
      if (error || !data) failFromSupabase('이미지 업로드 주소를 만들지 못했습니다.', error, 'signed_upload_failed');
      return { path, token: data.token, sortOrder, ...file };
    }));

    logServerEvent('admin.products.images.prepare', requestId, { productId: id, imageCount: uploads.length, uploadBytes: totalBytes });
    return NextResponse.json({ uploads, requestId });
  },
);

/** Verify uploaded objects and commit their metadata to the catalog. */
export const PUT = withAdminParams<{ id: string }>(
  'admin.products.images.complete',
  async ({ requestId, client, userId }, request, { id }) => {
    const product = await requireProduct(client, id);
    const body = await readJson(request) as { uploads?: unknown };
    if (!Array.isArray(body.uploads) || body.uploads.length === 0) {
      throw new ApiError(400, '완료할 이미지가 없습니다.', 'no_images');
    }
    if (body.uploads.length > MAX_IMAGES_PER_PRODUCT) throw new ApiError(400, '이미지가 너무 많습니다.', 'too_many_images');

    const uploads = (body.uploads as CompletedUpload[]).map((upload) => {
      if (!validatePath(id, upload.path)) throw new ApiError(400, '이미지 저장 경로가 올바르지 않습니다.', 'invalid_storage_path');
      const mimeType = typeof upload.mimeType === 'string' ? upload.mimeType : '';
      const byteSize = positiveInteger(upload.byteSize);
      const sortOrder = typeof upload.sortOrder === 'number' && Number.isSafeInteger(upload.sortOrder) && upload.sortOrder >= 0 ? upload.sortOrder : undefined;
      if (!ALLOWED_IMAGE_TYPES.has(mimeType) || !byteSize || byteSize > MAX_IMAGE_BYTES || sortOrder === undefined) {
        throw new ApiError(400, '업로드 완료 정보가 올바르지 않습니다.', 'invalid_upload_metadata');
      }
      return { path: upload.path, sortOrder, mimeType, byteSize, width: positiveInteger(upload.width), height: positiveInteger(upload.height) };
    });
    if (new Set(uploads.map((upload) => upload.path)).size !== uploads.length) {
      throw new ApiError(400, '같은 이미지가 중복으로 포함되었습니다.', 'duplicate_upload');
    }

    const { count: currentCount, error: countError } = await client
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (countError) failFromSupabase('기존 이미지 수를 확인하지 못했습니다.', countError, 'image_read_failed');
    if ((currentCount ?? 0) + uploads.length > MAX_IMAGES_PER_PRODUCT) {
      throw new ApiError(409, '다른 업로드가 먼저 완료되어 상품 사진 한도를 넘었습니다. 화면을 새로고침하고 다시 시도해 주세요.', 'image_limit_changed');
    }

    const checks = await Promise.all(uploads.map((upload) => client.storage.from(IMAGE_BUCKET).info(upload.path)));
    const missingIndex = checks.findIndex((check) => check.error || !check.data);
    if (missingIndex >= 0) {
      throw new ApiError(409, `Storage에서 "${uploads[missingIndex]?.path}" 업로드를 확인하지 못했습니다.`, 'upload_not_found');
    }

    const { error: rowError } = await client.from('product_images').insert(uploads.map((upload) => ({
      product_id: id,
      storage_path: upload.path,
      alt_text: product.name,
      sort_order: upload.sortOrder,
      width: upload.width ?? null,
      height: upload.height ?? null,
      byte_size: upload.byteSize,
      mime_type: upload.mimeType,
    })));
    if (rowError) failFromSupabase('이미지 정보를 저장하지 못했습니다.', rowError, 'image_row_insert_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_images_added',
      entity_type: 'product',
      entity_id: id,
      after_data: { count: uploads.length, paths: uploads.map((upload) => upload.path), requestId },
    });
    return NextResponse.json({ message: `원본 화질로 사진 ${uploads.length}장을 추가했습니다.`, requestId });
  },
);

/** Remove only unregistered objects after a failed direct upload. */
export const DELETE = withAdminParams<{ id: string }>(
  'admin.products.images.cleanup',
  async ({ requestId, client }, request, { id }) => {
    await requireProduct(client, id);
    const body = await readJson(request) as { paths?: unknown };
    const requested = Array.isArray(body.paths) ? body.paths.filter((path) => validatePath(id, path)) : [];
    if (requested.length === 0) return NextResponse.json({ message: '정리할 파일이 없습니다.', requestId });

    const { data: registered, error } = await client.from('product_images').select('storage_path').in('storage_path', requested);
    if (error) failFromSupabase('등록된 이미지를 확인하지 못했습니다.', error, 'image_read_failed');
    const protectedPaths = new Set((registered ?? []).map((row) => row.storage_path));
    const removable = requested.filter((path) => !protectedPaths.has(path));
    if (removable.length) await client.storage.from(IMAGE_BUCKET).remove(removable);
    return NextResponse.json({ message: `미완료 파일 ${removable.length}개를 정리했습니다.`, requestId });
  },
);
