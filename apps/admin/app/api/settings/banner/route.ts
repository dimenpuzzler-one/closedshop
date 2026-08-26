import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logServerEvent } from '@closed-commerce/observability';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const MAX_BANNER_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BANNER_PREFIX = 'banners/';

function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

function isBannerPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(BANNER_PREFIX) && /^banners\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(path);
}

/** 배너 파일도 Vercel Function을 거치지 않고 Storage로 직접 올린다(4.5MB 본문 한도 회피). */
export const POST = withAdmin(
  'admin.settings.banner.prepare',
  async ({ requestId, client }, request) => {
    const body = (await readJson(request)) as { mimeType?: unknown; byteSize?: unknown };
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    const byteSize = typeof body.byteSize === 'number' && Number.isSafeInteger(body.byteSize) ? body.byteSize : 0;
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new ApiError(400, 'JPG, PNG, WEBP 이미지만 올릴 수 있습니다.', 'unsupported_image_type');
    }
    if (byteSize <= 0 || byteSize > MAX_BANNER_BYTES) {
      throw new ApiError(400, `배너 이미지는 ${(MAX_BANNER_BYTES / 1024 / 1024).toFixed(0)}MB 이하여야 합니다.`, 'image_too_large');
    }

    const path = `${BANNER_PREFIX}${randomUUID()}.${extensionFor(mimeType)}`;
    const { data, error } = await client.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) failFromSupabase('배너 업로드 주소를 만들지 못했습니다.', error, 'signed_upload_failed');

    logServerEvent('admin.settings.banner.prepare', requestId, { byteSize, mimeType });
    return NextResponse.json({ upload: { path, token: data.token }, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 올릴 수 없습니다.' }) },
);

/** 업로드된 객체를 확인한 뒤에만 설정에 반영한다. 이전 배너는 지운다. */
export const PUT = withAdmin(
  'admin.settings.banner.commit',
  async ({ requestId, client, userId }, request) => {
    const body = (await readJson(request)) as { path?: unknown };
    if (!isBannerPath(body.path)) throw new ApiError(400, '배너 저장 경로가 올바르지 않습니다.', 'invalid_storage_path');
    const path = body.path;

    const check = await client.storage.from(IMAGE_BUCKET).info(path);
    if (check.error || !check.data) {
      throw new ApiError(409, 'Storage에서 업로드된 배너를 확인하지 못했습니다.', 'upload_not_found');
    }

    const { data: previous } = await client.from('store_settings').select('hero_banner_path').eq('id', 1).maybeSingle();
    const { error } = await client.from('store_settings').upsert({ id: 1, hero_banner_path: path }, { onConflict: 'id' });
    if (error) failFromSupabase('배너를 저장하지 못했습니다.', error, 'banner_update_failed');

    // 새 배너가 확정된 다음에만 이전 파일을 지운다. 실패해도 화면은 이미 정상이다.
    const oldPath = previous?.hero_banner_path;
    if (isBannerPath(oldPath) && oldPath !== path) {
      await client.storage.from(IMAGE_BUCKET).remove([oldPath]).catch(() => undefined);
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'store_banner_updated',
      entity_type: 'store_settings',
      before_data: { path: oldPath ?? null },
      after_data: { path, requestId },
    });
    return NextResponse.json({ message: '메인 배너를 바꿨습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 올릴 수 없습니다.' }) },
);

/** 배너를 없애고 기본 그래픽으로 되돌린다. */
export const DELETE = withAdmin(
  'admin.settings.banner.remove',
  async ({ requestId, client, userId }) => {
    const { data: previous } = await client.from('store_settings').select('hero_banner_path').eq('id', 1).maybeSingle();
    const { error } = await client.from('store_settings').upsert({ id: 1, hero_banner_path: null }, { onConflict: 'id' });
    if (error) failFromSupabase('배너를 지우지 못했습니다.', error, 'banner_update_failed');
    const oldPath = previous?.hero_banner_path;
    if (isBannerPath(oldPath)) await client.storage.from(IMAGE_BUCKET).remove([oldPath]).catch(() => undefined);

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'store_banner_removed',
      entity_type: 'store_settings',
      before_data: { path: oldPath ?? null, requestId },
    });
    return NextResponse.json({ message: '메인 배너를 지웠습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 지울 수 없습니다.' }) },
);
