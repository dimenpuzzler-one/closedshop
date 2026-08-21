import { NextResponse } from 'next/server';
import { logServerError } from '@closed-commerce/observability';
import { productUpdateSchema } from '@closed-commerce/validation';
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
      .select('id, slug, name, category, base_price, shipping_fee, visibility, status')
      .eq('id', id)
      .maybeSingle();
    if (readError) failFromSupabase('상품을 조회하지 못했습니다.', readError, 'product_read_failed');
    if (!before) throw new ApiError(404, `상품을 찾을 수 없습니다: ${id}`, 'product_not_found');

    const patch = parsed.data;
    const productUpdate: Record<string, unknown> = {};
    if (patch.name !== undefined) productUpdate.name = patch.name;
    if (patch.category !== undefined) productUpdate.category = patch.category;
    if (patch.shortDescription !== undefined) productUpdate.short_description = patch.shortDescription;
    if (patch.description !== undefined) productUpdate.description = patch.description;
    if (patch.basePrice !== undefined) productUpdate.base_price = patch.basePrice;
    if (patch.supplyCost !== undefined) productUpdate.supply_cost = patch.supplyCost;
    if (patch.shippingFee !== undefined) productUpdate.shipping_fee = patch.shippingFee;
    if (patch.visibility !== undefined) productUpdate.visibility = patch.visibility;
    if (patch.status !== undefined) productUpdate.status = patch.status;

    if (Object.keys(productUpdate).length > 0) {
      const { error } = await client.from('products').update(productUpdate).eq('id', id);
      if (error) failFromSupabase('상품 정보를 수정하지 못했습니다.', error, 'product_update_failed');
    }

    if (patch.optionPrice !== undefined) {
      const { error } = await client.from('product_options').update({ price: patch.optionPrice }).eq('product_id', id);
      if (error) failFromSupabase('옵션가를 수정하지 못했습니다.', error, 'option_update_failed');
    }

    if (patch.stock !== undefined) {
      // 예약분(reserved_quantity)보다 낮게 내리면 DB 제약에 걸린다. 미리 막고 이유를 알려준다.
      const { data: inventory } = await client.from('inventory').select('reserved_quantity').eq('product_id', id).maybeSingle();
      const reserved = inventory?.reserved_quantity ?? 0;
      if (patch.stock < reserved) {
        throw new ApiError(400, `이미 ${reserved}개가 주문에 예약되어 있어 재고를 ${patch.stock}개로 낮출 수 없습니다.`, 'stock_below_reserved');
      }
      const { error } = await client.from('inventory').update({ quantity: patch.stock }).eq('product_id', id);
      if (error) failFromSupabase('재고를 수정하지 못했습니다.', error, 'inventory_update_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'product_updated',
      entity_type: 'product',
      entity_id: id,
      before_data: before,
      after_data: { ...patch, requestId },
    });
    return NextResponse.json({ message: `"${before.name}" 상품이 수정되었습니다.`, requestId });
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
