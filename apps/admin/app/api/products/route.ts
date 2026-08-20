import { NextResponse } from 'next/server';
import { productCreateSchema } from '@closed-commerce/validation';
import { getAdminContext } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const parsed = productCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: '상품 입력값이 올바르지 않습니다.', details: parsed.error.flatten() }, { status: 400 });
  const context = await getAdminContext();
  if (context.mode === 'demo') return NextResponse.json({ message: '데모 상품 등록이 처리되었습니다.', productId: `demo-${Date.now()}` });
  if (context.mode !== 'supabase') return NextResponse.json({ error: context.message }, { status: context.mode === 'unauthorized' ? 403 : 503 });
  const { data: product, error: productError } = await context.client.from('products').insert({ slug: parsed.data.slug, name: parsed.data.name, short_description: parsed.data.shortDescription, description: parsed.data.description, base_price: parsed.data.basePrice, supply_cost: parsed.data.supplyCost, shipping_fee: parsed.data.shippingFee, visibility: parsed.data.visibility, status: parsed.data.status }).select('id').single();
  if (productError || !product) return NextResponse.json({ error: productError?.code === '23505' ? '이미 사용 중인 상품 slug입니다.' : '상품을 저장하지 못했습니다.' }, { status: 500 });
  const { error: optionError } = await context.client.from('product_options').insert({ product_id: product.id, name: parsed.data.optionName, value: parsed.data.optionValue, price: parsed.data.optionPrice });
  if (optionError) {
    await context.client.from('products').delete().eq('id', product.id);
    return NextResponse.json({ error: '상품 옵션을 저장하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 });
  }
  const { error: inventoryError } = await context.client.from('inventory').insert({ product_id: product.id, quantity: parsed.data.stock, reserved_quantity: 0 });
  if (inventoryError) {
    await context.client.from('products').delete().eq('id', product.id);
    return NextResponse.json({ error: '재고를 저장하지 못했습니다. 상품 등록은 취소되었습니다.' }, { status: 500 });
  }
  await context.client.from('admin_audit_logs').insert({ actor_user_id: context.userId, action: 'product_created', entity_type: 'product', entity_id: product.id, after_data: parsed.data });
  return NextResponse.json({ message: '상품이 등록되었습니다.', productId: product.id });
}
