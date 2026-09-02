import { NextResponse } from 'next/server';
import { logServerError } from '@closed-commerce/observability';
import { homeBannerUpdateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';
const BANNER_PATH = /^banners\/[0-9a-f-]+\.(?:jpg|png|webp)$/;

function assertId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, '배너 ID가 올바르지 않습니다.', 'invalid_banner_id');
  }
}

export const PATCH = withAdminParams<{ id: string }>(
  'admin.settings.banner.update',
  async ({ requestId, client, userId }, request, { id }) => {
    assertId(id);
    const parsed = homeBannerUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, '배너 수정값이 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }
    const { data: before, error: readError } = await client
      .from('home_banners')
      .select('id, image_path, alt_text, sort_order, is_active, width, height')
      .eq('id', id)
      .maybeSingle();
    if (readError) failFromSupabase('배너를 조회하지 못했습니다.', readError, 'banner_read_failed');
    if (!before) throw new ApiError(404, '배너를 찾을 수 없습니다.', 'banner_not_found');

    const patch: { alt_text?: string; sort_order?: number; is_active?: boolean } = {};
    if (parsed.data.altText !== undefined) patch.alt_text = parsed.data.altText;
    if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;

    const { data: updated, error } = await client
      .from('home_banners')
      .update(patch)
      .eq('id', id)
      .select('id, image_path, alt_text, sort_order, is_active, width, height')
      .single();
    if (error || !updated) failFromSupabase('배너를 수정하지 못했습니다.', error, 'banner_update_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'home_banner_updated',
      entity_type: 'home_banner',
      entity_id: id,
      before_data: before,
      after_data: { ...updated, requestId },
    });
    return NextResponse.json({ message: '배너 설정을 저장했습니다.', banner: updated, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 수정할 수 없습니다.' }) },
);

export const DELETE = withAdminParams<{ id: string }>(
  'admin.settings.banner.remove',
  async ({ requestId, client, userId }, _request, { id }) => {
    assertId(id);
    const { data: before, error: readError } = await client
      .from('home_banners')
      .select('id, image_path, alt_text, sort_order, is_active, width, height')
      .eq('id', id)
      .maybeSingle();
    if (readError) failFromSupabase('배너를 조회하지 못했습니다.', readError, 'banner_read_failed');
    if (!before) throw new ApiError(404, '배너를 찾을 수 없습니다.', 'banner_not_found');

    const { error } = await client.from('home_banners').delete().eq('id', id);
    if (error) failFromSupabase('배너를 삭제하지 못했습니다.', error, 'banner_delete_failed');

    if (BANNER_PATH.test(before.image_path)) {
      const { error: storageError } = await client.storage.from(IMAGE_BUCKET).remove([before.image_path]);
      if (storageError) {
        logServerError('admin.settings.banner.remove', requestId, storageError, {
          stage: 'storage_remove', bannerId: id, path: before.image_path,
        });
      }
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'home_banner_removed',
      entity_type: 'home_banner',
      entity_id: id,
      before_data: { ...before, requestId },
    });
    return NextResponse.json({ message: '홈 배너를 삭제했습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '데모 모드에서는 배너를 삭제할 수 없습니다.' }) },
);
