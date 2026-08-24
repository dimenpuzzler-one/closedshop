import { NextResponse } from 'next/server';
import { logServerError } from '@closed-commerce/observability';
import { ApiError, demoResponse, failFromSupabase, withAdminParams } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';

/** 사진 한 장 삭제. Storage 파일도 함께 지운다. */
export const DELETE = withAdminParams<{ id: string; imageId: string }>(
  'admin.products.images.delete',
  async ({ requestId, client, userId }, _request, { id, imageId }) => {
    const { data: image, error: readError } = await client
      .from('product_images')
      .select('id, product_id, storage_path')
      .eq('id', imageId)
      .maybeSingle();
    if (readError) failFromSupabase('사진을 조회하지 못했습니다.', readError, 'image_read_failed');
    if (!image || image.product_id !== id) throw new ApiError(404, '해당 상품의 사진을 찾을 수 없습니다.', 'image_not_found');

    const { error: storageError } = await client.storage.from(IMAGE_BUCKET).remove([image.storage_path]);
    // 파일이 남더라도 목록에서는 지워야 한다. 고아 파일은 로그로만 남긴다.
    if (storageError) logServerError('admin.products.images.delete', requestId, storageError, { stage: 'storage_remove', imageId });

    const { error: deleteError } = await client.from('product_images').delete().eq('id', imageId);
    if (deleteError) failFromSupabase('사진을 삭제하지 못했습니다.', deleteError, 'image_delete_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_image_deleted',
      entity_type: 'product',
      entity_id: id,
      before_data: { imageId, storagePath: image.storage_path },
      after_data: { requestId },
    });
    return NextResponse.json({ message: '사진을 삭제했습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '사진이 삭제되었습니다.' }) },
);

/** 이 사진을 대표 이미지(썸네일)로 지정한다. sort_order 0이 썸네일이다. */
export const PATCH = withAdminParams<{ id: string; imageId: string }>(
  'admin.products.images.thumbnail',
  async ({ requestId, client, userId }, _request, { id, imageId }) => {
    const { data: images, error: readError } = await client
      .from('product_images')
      .select('id, sort_order')
      .eq('product_id', id)
      .order('sort_order');
    if (readError) failFromSupabase('사진 목록을 조회하지 못했습니다.', readError, 'image_read_failed');
    const target = (images ?? []).find((image) => image.id === imageId);
    if (!target) throw new ApiError(404, '해당 상품의 사진을 찾을 수 없습니다.', 'image_not_found');

    // 대상만 0으로 두고 나머지는 1부터 다시 매긴다.
    const rest = (images ?? []).filter((image) => image.id !== imageId);
    const updates = [{ id: imageId, sort_order: 0 }, ...rest.map((image, index) => ({ id: image.id, sort_order: index + 1 }))];
    for (const update of updates) {
      const { error } = await client.from('product_images').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) failFromSupabase('대표 사진을 변경하지 못했습니다.', error, 'image_sort_update_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_thumbnail_changed',
      entity_type: 'product',
      entity_id: id,
      after_data: { imageId, requestId },
    });
    return NextResponse.json({ message: '대표 사진을 변경했습니다.', requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '대표 사진이 변경되었습니다.' }) },
);
