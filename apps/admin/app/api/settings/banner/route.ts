import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logServerError, logServerEvent } from '@closed-commerce/observability';
import { homeBannerCommitSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const MAX_BANNER_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BANNER_PREFIX = 'banners/';
const MAX_HOME_BANNERS = 12;

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

/** 업로드된 객체를 확인한 뒤 홈 배너 목록에 추가한다. 기존 배너는 그대로 둔다. */
export const PUT = withAdmin(
  'admin.settings.banner.commit',
  async ({ requestId, client, userId }, request) => {
    const parsed = homeBannerCommitSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, '배너 입력값이 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }
    const { path, altText, sortOrder, width, height } = parsed.data;
    if (!isBannerPath(path)) throw new ApiError(400, '배너 저장 경로가 올바르지 않습니다.', 'invalid_storage_path');

    const check = await client.storage.from(IMAGE_BUCKET).info(path);
    if (check.error || !check.data) {
      throw new ApiError(409, 'Storage에서 업로드된 배너를 확인하지 못했습니다.', 'upload_not_found');
    }

    // 브라우저가 완료 응답을 받기 전에 연결이 끊겨 같은 요청을 다시 보내도
    // 이미 등록된 파일을 오류나 중복 배너로 만들지 않는다.
    const { data: existing, error: existingError } = await client
      .from('home_banners')
      .select('id, image_path, alt_text, sort_order, is_active, width, height')
      .eq('image_path', path)
      .maybeSingle();
    if (existingError) failFromSupabase('기존 배너를 확인하지 못했습니다.', existingError, 'banner_read_failed');
    if (existing) {
      return NextResponse.json({ message: '이미 등록된 홈 배너입니다.', banner: existing, requestId });
    }

    const { count, error: countError } = await client
      .from('home_banners')
      .select('id', { count: 'exact', head: true });
    if (countError) failFromSupabase('등록된 배너 수를 확인하지 못했습니다.', countError, 'banner_count_failed');
    if ((count ?? 0) >= MAX_HOME_BANNERS) {
      await client.storage.from(IMAGE_BUCKET).remove([path]).catch(() => undefined);
      throw new ApiError(409, `홈 배너는 최대 ${MAX_HOME_BANNERS}장까지 등록할 수 있습니다.`, 'banner_limit_reached');
    }

    const { data: banner, error } = await client
      .from('home_banners')
      .insert({ image_path: path, alt_text: altText, sort_order: sortOrder, width: width ?? null, height: height ?? null })
      .select('id, image_path, alt_text, sort_order, is_active, width, height')
      .single();
    if (error || !banner) {
      // 두 완료 요청이 동시에 들어온 경우 한쪽의 unique 충돌은 실패가 아니라
      // 이미 같은 파일이 등록된 성공 상태다. 여기서 파일을 지우면 정상 배너까지 깨진다.
      if (error?.code === '23505') {
        const { data: racedBanner, error: racedReadError } = await client
          .from('home_banners')
          .select('id, image_path, alt_text, sort_order, is_active, width, height')
          .eq('image_path', path)
          .maybeSingle();
        if (racedReadError) failFromSupabase('등록된 배너를 다시 확인하지 못했습니다.', racedReadError, 'banner_read_failed');
        if (racedBanner) {
          return NextResponse.json({ message: '이미 등록된 홈 배너입니다.', banner: racedBanner, requestId });
        }
      }
      await client.storage.from(IMAGE_BUCKET).remove([path]).catch(() => undefined);
      failFromSupabase('배너를 저장하지 못했습니다.', error, 'banner_insert_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'home_banner_created',
      entity_type: 'home_banner',
      entity_id: banner.id,
      after_data: { ...banner, requestId },
    });
    return NextResponse.json({ message: '홈 배너를 추가했습니다.', banner, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 올릴 수 없습니다.' }) },
);

/** 직접 업로드 뒤 DB 등록이 끝나지 않은 객체만 정리한다. 등록된 배너 파일은 절대 지우지 않는다. */
export const DELETE = withAdmin(
  'admin.settings.banner.cleanup',
  async ({ requestId, client }, request) => {
    const body = (await readJson(request)) as { paths?: unknown };
    const requested = Array.isArray(body.paths)
      ? [...new Set(body.paths.filter(isBannerPath))].slice(0, MAX_HOME_BANNERS)
      : [];
    if (requested.length === 0) return NextResponse.json({ message: '정리할 파일이 없습니다.', requestId });

    const { data: registered, error } = await client
      .from('home_banners')
      .select('image_path')
      .in('image_path', requested);
    if (error) failFromSupabase('등록된 배너 파일을 확인하지 못했습니다.', error, 'banner_read_failed');

    const protectedPaths = new Set((registered ?? []).map((row) => row.image_path));
    const removable = requested.filter((path) => !protectedPaths.has(path));
    if (removable.length) {
      const { error: removeError } = await client.storage.from(IMAGE_BUCKET).remove(removable);
      if (removeError) {
        logServerError('admin.settings.banner.cleanup', requestId, removeError, { paths: removable });
        failFromSupabase('미완료 배너 파일을 정리하지 못했습니다.', removeError, 'banner_cleanup_failed');
      }
    }
    logServerEvent('admin.settings.banner.cleanup', requestId, { removedCount: removable.length });
    return NextResponse.json({ message: `미완료 배너 파일 ${removable.length}개를 정리했습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '정리할 파일이 없습니다.' }) },
);
