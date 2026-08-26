import { NextResponse } from 'next/server';
import { categoryCreateSchema } from '@closed-commerce/validation';
import { ApiError, demoResponse, failFromSupabase, readJson, withAdmin } from '@/lib/route-handler';

export const POST = withAdmin(
  'admin.categories.create',
  async ({ requestId, client, userId }, request) => {
    const parsed = categoryCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, '카테고리 정보가 올바르지 않습니다.', 'validation_failed', parsed.error.flatten());
    }
    const { name, sortOrder } = parsed.data;

    const { error } = await client.from('product_categories').insert({ name, sort_order: sortOrder ?? 100 });
    if (error) {
      // 23505 = unique_violation. 같은 이름을 두 번 만드는 건 사고가 아니라 흔한 실수다.
      if (error.code === '23505') throw new ApiError(409, `"${name}" 카테고리는 이미 있습니다.`, 'category_exists');
      failFromSupabase('카테고리를 추가하지 못했습니다.', error, 'category_insert_failed');
    }

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'category_created',
      entity_type: 'product_category',
      after_data: { name, sortOrder: sortOrder ?? 100, requestId },
    });
    return NextResponse.json({ message: `"${name}" 카테고리를 추가했습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '카테고리가 추가되었습니다.' }) },
);

/**
 * 카테고리를 지워도 상품은 그대로 둔다(products.category는 text).
 * 상품이 붙어 있으면 지우지 않고 막는다 — 지운 뒤 상품이 어느 분류에도 안 잡히면
 * 운영자는 원인을 알 수 없다.
 */
export const DELETE = withAdmin(
  'admin.categories.delete',
  async ({ requestId, client, userId }, request) => {
    const body = (await readJson(request)) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new ApiError(400, '삭제할 카테고리 이름이 없습니다.', 'category_name_required');

    const { count, error: countError } = await client
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category', name);
    if (countError) failFromSupabase('카테고리에 속한 상품을 확인하지 못했습니다.', countError, 'product_count_failed');
    if ((count ?? 0) > 0) {
      throw new ApiError(
        409,
        `"${name}" 카테고리에 상품 ${count}개가 있습니다. 상품의 카테고리를 먼저 바꾼 뒤 삭제해 주세요.`,
        'category_in_use',
      );
    }

    const { error } = await client.from('product_categories').delete().eq('name', name);
    if (error) failFromSupabase('카테고리를 삭제하지 못했습니다.', error, 'category_delete_failed');

    await client.from('admin_audit_logs').insert({
      actor_user_id: userId,
      action: 'category_deleted',
      entity_type: 'product_category',
      before_data: { name, requestId },
    });
    return NextResponse.json({ message: `"${name}" 카테고리를 삭제했습니다.`, requestId });
  },
  { demo: (requestId) => demoResponse(requestId, { message: '카테고리가 삭제되었습니다.' }) },
);
