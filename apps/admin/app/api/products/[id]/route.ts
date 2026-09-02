import { NextResponse } from 'next/server';
import { logServerError } from '@closed-commerce/observability';
import { productUpdateSchema } from '@closed-commerce/validation';
import type { Json } from '@closed-commerce/db';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdminParams } from '@/lib/route-handler';

const IMAGE_BUCKET = 'product-images';

/**
 * 상품 등록만 있고 수정·삭제가 없어서, 잘못 올린 상품은 DB를 직접 건드려야 했다.
 * 운영자가 테스트 상품을 지우거나 판매를 내릴 수 있어야 한다.
 */
export const PATCH = withAdminParams<{ id: string }>(
  'admin.products.update',
  async ({ requestId, client, userId }, request, { id }) => {
    const parsed = productUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const summary = Object.entries(flat.fieldErrors)
        .map(([field, messages]) => `${field}: ${(messages ?? []).join(', ')}`)
        .join(' / ');
      throw new ApiError(400, `상품 수정값이 올바르지 않습니다. ${summary || flat.formErrors.join(' ')}`.trim(), 'validation_failed', flat);
    }

    const { data: before, error: readError } = await client
      .from('products')
      .select('id, slug, name, category, short_description, description, base_price, supply_cost, shipping_fee, home_sort_order, visibility, status')
      .eq('id', id)
      .maybeSingle();
    if (readError) failFromSupabase('상품을 조회하지 못했습니다.', readError, 'product_read_failed');
    if (!before) throw new ApiError(404, `상품을 찾을 수 없습니다: ${id}`, 'product_not_found');

    const patch = parsed.data;
    const { data: updated, error: updateError } = await client.rpc('admin_update_product', {
      p_product_id: id,
      p_patch: patch as Json,
    });
    if (updateError) {
      if (updateError.code === '23514') {
        throw new ApiError(400, updateError.message, 'stock_below_reserved');
      }
      if (updateError.code === 'P0002') {
        throw new ApiError(409, updateError.message, 'incomplete_product_data');
      }
      failFromSupabase('상품 정보를 수정하지 못했습니다.', updateError, 'product_update_failed');
    }
    if (!updated) throw new ApiError(500, '수정 결과를 다시 확인하지 못했습니다.', 'empty_update_result');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_updated',
      entity_type: 'product',
      entity_id: id,
      before_data: before,
      after_data: { updated, requestId },
    });
    return NextResponse.json({ message: `"${before.name}" 상품이 수정되었습니다.`, product: updated, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '상품 수정이 처리되었습니다.' }) },
);

export const DELETE = withAdminParams<{ id: string }>(
  'admin.products.delete',
  async ({ requestId, client, userId }, _request, { id }) => {
    const { data: product, error: readError } = await client.from('products').select('id, slug, name, status').eq('id', id).maybeSingle();
    if (readError) failFromSupabase('상품을 조회하지 못했습니다.', readError, 'product_read_failed');
    if (!product) throw new ApiError(404, `상품을 찾을 수 없습니다: ${id}`, 'product_not_found');

    // 주문 이력이 있으면 삭제하면 안 된다(주문 스냅샷의 참조가 끊긴다).
    const { count: orderedCount, error: orderCheckError } = await client
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (orderCheckError) failFromSupabase('주문 이력을 확인하지 못했습니다.', orderCheckError, 'order_check_failed');
    if ((orderedCount ?? 0) > 0) {
      throw new ApiError(
        409,
        `"${product.name}"은 주문 이력이 ${orderedCount}건 있어 삭제할 수 없습니다. 판매를 멈추려면 상태를 "판매 중지"로 바꿔 주세요.`,
        'product_has_orders',
      );
    }

    const { data: images } = await client.from('product_images').select('storage_path').eq('product_id', id);
    const paths = (images ?? []).map((image) => image.storage_path);
    if (paths.length) {
      const { error: storageError } = await client.storage.from(IMAGE_BUCKET).remove(paths);
      // Storage 정리 실패로 삭제 자체를 막지는 않되, 고아 파일이 남았다는 사실은 남긴다.
      if (storageError) logServerError('admin.products.delete', requestId, storageError, { stage: 'storage_remove', productId: id, paths });
    }

    // product_options / product_images / inventory는 FK가 on delete cascade다.
    const { error: deleteError } = await client.from('products').delete().eq('id', id);
    if (deleteError) failFromSupabase('상품을 삭제하지 못했습니다.', deleteError, 'product_delete_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_deleted',
      entity_type: 'product',
      entity_id: id,
      before_data: product,
      after_data: { removedImages: paths.length, requestId },
    });
    return NextResponse.json({ message: `"${product.name}" 상품이 삭제되었습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '상품 삭제가 처리되었습니다.' }) },
);
