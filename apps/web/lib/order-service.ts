import { randomUUID } from 'node:crypto';
import { getCommissionRule } from '@closed-commerce/config';
import { calculateCartTotalsFromLines, type CatalogLine } from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, type AppSupabaseClient, type Json } from '@closed-commerce/db';
import { MockPaymentProvider } from '@closed-commerce/payment';
import { calculateTwoDepthCommissions } from '@closed-commerce/referral';
import type { CommissionSnapshot, Product, PromotionCode, ReferralNode } from '@closed-commerce/types';
import type { CreateOrderInput } from '@closed-commerce/validation';

export class OrderServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'OrderServiceError';
  }
}

export interface PersistedOrderResult {
  orderId: string;
  orderNumber: string;
  payment: { paymentId: string; orderId: string; amount: number; status: 'paid'; paidAt: string };
  totals: ReturnType<typeof calculateCartTotalsFromLines>;
  commissionPreview: Pick<CommissionSnapshot, 'depth' | 'beneficiaryName' | 'commissionAmount' | 'status'>[];
}

function fail(status: number, message: string): never {
  throw new OrderServiceError(status, message);
}

async function loadPromotion(client: AppSupabaseClient, input: CreateOrderInput, buyerUserId: string, referralCodeId: string): Promise<PromotionCode | undefined> {
  if (!input.promotionCode) return undefined;
  const normalized = input.promotionCode.trim().toUpperCase();
  const { data: code, error: codeError } = await client
    .from('promotion_codes')
    .select('id, code, status, starts_at, expires_at, total_usage_limit, per_member_usage_limit, usage_count')
    .eq('code', normalized)
    .eq('status', 'active')
    .maybeSingle();
  if (codeError || !code) fail(400, '유효하지 않은 Promotion Code입니다.');
  const now = Date.now();
  if ((code.starts_at && new Date(code.starts_at).getTime() > now) || (code.expires_at && new Date(code.expires_at).getTime() < now)) fail(400, '현재 사용할 수 없는 Promotion Code입니다.');
  if (code.total_usage_limit !== null && code.usage_count >= code.total_usage_limit) fail(400, 'Promotion Code 사용 한도가 끝났습니다.');
  if (code.per_member_usage_limit !== null) {
    const { count, error: redemptionError } = await client
      .from('promotion_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_code_id', code.id)
      .eq('user_id', buyerUserId);
    if (redemptionError) fail(500, 'Promotion 사용량을 확인하지 못했습니다.');
    if ((count ?? 0) >= code.per_member_usage_limit) fail(400, '회원별 Promotion Code 사용 한도를 초과했습니다.');
  }
  const { data: rule, error: ruleError } = await client
    .from('promotion_rules')
    .select('product_ids, referral_code_ids, minimum_order_amount, minimum_quantity, discount_rate, discount_amount')
    .eq('promotion_code_id', code.id)
    .maybeSingle();
  if (ruleError || !rule) fail(400, 'Promotion 조건을 찾을 수 없습니다.');
  if (rule.referral_code_ids.length > 0 && !rule.referral_code_ids.includes(referralCodeId)) fail(400, '이 Referral Code에는 적용할 수 없는 Promotion입니다.');
  return {
    id: code.id,
    code: code.code,
    status: code.status,
    startsAt: code.starts_at ?? undefined,
    expiresAt: code.expires_at ?? undefined,
    totalUsageLimit: code.total_usage_limit ?? undefined,
    perMemberUsageLimit: code.per_member_usage_limit ?? undefined,
    usageCount: code.usage_count,
    rule: {
      productIds: rule.product_ids,
      referralCodeIds: rule.referral_code_ids,
      minimumOrderAmount: rule.minimum_order_amount ?? undefined,
      minimumQuantity: rule.minimum_quantity ?? undefined,
      discountRate: rule.discount_rate ?? undefined,
      discountAmount: rule.discount_amount ?? undefined,
    },
  };
}

async function loadCatalog(client: AppSupabaseClient, input: CreateOrderInput): Promise<{ lines: CatalogLine[]; products: Product[] }> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const [{ data: products, error: productError }, { data: options, error: optionError }, { data: inventory, error: inventoryError }] = await Promise.all([
    client.from('products').select('id, slug, name, short_description, description, base_price, supply_cost, shipping_fee, visibility, status, created_at').in('id', productIds).eq('status', 'active'),
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    client.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds),
  ]);
  if (productError || optionError || inventoryError) fail(500, '상품 정보를 불러오지 못했습니다.');
  if ((products?.length ?? 0) !== productIds.length) fail(400, '판매 중인 상품이 아니거나 상품을 찾을 수 없습니다.');
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const optionMap = new Map((options ?? []).map((option) => [option.id, option]));
  const inventoryMap = new Map((inventory ?? []).map((row) => [row.product_id, row]));
  const lines: CatalogLine[] = input.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) fail(400, '상품을 찾을 수 없습니다.');
    const productOptions = (options ?? []).filter((option) => option.product_id === item.productId);
    const option = item.optionId ? optionMap.get(item.optionId) : productOptions[0];
    if (!option || option.product_id !== item.productId) fail(400, '상품 옵션이 올바르지 않습니다.');
    const stock = inventoryMap.get(item.productId);
    const available = stock ? stock.quantity - stock.reserved_quantity : 0;
    if (available < item.quantity) fail(400, `${product.name} 재고가 부족합니다.`);
    return { productId: product.id, productName: product.name, optionId: option.id, optionName: `${option.name}: ${option.value}`, unitPrice: option.price, shippingFee: product.shipping_fee, quantity: item.quantity };
  });
  const normalizedProducts: Product[] = (products ?? []).map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.short_description,
    description: product.description,
    weight: '',
    price: product.base_price,
    supplyCost: product.supply_cost ?? undefined,
    shippingFee: product.shipping_fee,
    visibility: product.visibility,
    status: product.status,
    imageUrl: '',
    options: [],
    tags: [],
  }));
  return { lines, products: normalizedProducts };
}

async function loadReferral(client: AppSupabaseClient, buyerUserId: string, referralCode: string | undefined) {
  const { data: relationship, error: relationshipError } = await client
    .from('referral_relationships')
    .select('id, referred_user_id, referrer_user_id, referral_code_id, source, campaign_id, created_at')
    .eq('referred_user_id', buyerUserId)
    .maybeSingle();
  if (relationshipError || !relationship) fail(403, '회원의 최초 Referral 귀속을 확인할 수 없습니다.');
  const { data: referral, error: referralError } = await client
    .from('referral_codes')
    .select('id, code, owner_user_id, campaign_id, status, starts_at, expires_at, created_at')
    .eq('id', relationship.referral_code_id)
    .eq('status', 'active')
    .maybeSingle();
  if (referralError || !referral) fail(403, '최초 Referral Code가 더 이상 유효하지 않습니다.');
  if (referralCode && referral.code !== referralCode.trim().toUpperCase()) fail(400, '최초 가입 Referral Code와 다른 코드로 주문할 수 없습니다.');
  if (referral.owner_user_id !== relationship.referrer_user_id) fail(500, 'Referral 귀속 데이터가 일치하지 않습니다.');
  const { data: parentRelationship, error: parentError } = await client
    .from('referral_relationships')
    .select('id, referred_user_id, referrer_user_id, referral_code_id, source, campaign_id, created_at')
    .eq('referred_user_id', relationship.referrer_user_id)
    .maybeSingle();
  if (parentError) fail(500, '상위 Referral 관계를 확인하지 못했습니다.');
  const beneficiaryIds = [relationship.referrer_user_id, ...(parentRelationship ? [parentRelationship.referrer_user_id] : [])];
  const { data: profiles, error: profileError } = await client.from('profiles').select('id, display_name').in('id', beneficiaryIds);
  if (profileError) fail(500, '추천인 정보를 확인하지 못했습니다.');
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name ?? profile.id]));
  const lookup = new Map<string, ReferralNode>();
  lookup.set(buyerUserId, { userId: relationship.referrer_user_id, name: names.get(relationship.referrer_user_id) ?? relationship.referrer_user_id });
  if (parentRelationship) lookup.set(relationship.referrer_user_id, { userId: parentRelationship.referrer_user_id, name: names.get(parentRelationship.referrer_user_id) ?? parentRelationship.referrer_user_id });
  return { referral, lookup };
}

export async function createPersistedOrder(input: CreateOrderInput, buyerUserId: string): Promise<PersistedOrderResult> {
  const client = createServiceRoleSupabaseClient();
  const { referral, lookup } = await loadReferral(client, buyerUserId, input.referralCode);
  const { lines } = await loadCatalog(client, input);
  const promotion = await loadPromotion(client, input, buyerUserId, referral.id);
  const totals = calculateCartTotalsFromLines(lines, promotion);
  if (promotion && (promotion.rule.discountRate !== undefined || promotion.rule.discountAmount !== undefined) && totals.discountAmount === 0) fail(400, 'Promotion Code의 조건을 충족하지 않았습니다.');
  const orderId = randomUUID();
  const orderNumber = `CC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderId.slice(0, 6).toUpperCase()}`;
  const payment = new MockPaymentProvider();
  const paymentSession = await payment.createPayment({ orderId, amount: totals.paidAmount, customerName: input.address.recipientName });
  let verifiedPayment: Awaited<ReturnType<MockPaymentProvider['verifyPayment']>> | undefined;
  let orderCreated = false;
  const reservedLines: CatalogLine[] = [];
  try {
    const { error: orderError } = await client.from('orders').insert({
      id: orderId,
      order_number: orderNumber,
      buyer_user_id: buyerUserId,
      referrer_user_id: referral.owner_user_id,
      referral_code: referral.code,
      promotion_code: promotion?.code ?? null,
      status: 'payment_pending',
      gross_amount: totals.grossAmount,
      discount_amount: totals.discountAmount,
      shipping_amount: totals.shippingAmount,
      paid_amount: totals.paidAmount,
      commissionable_amount: totals.commissionableAmount,
      address_snapshot: input.address as unknown as Json,
    });
    if (orderError) fail(500, '주문을 저장하지 못했습니다.');
    orderCreated = true;
    const { error: itemError } = await client.from('order_items').insert(lines.map((line) => {
      const subtotal = line.unitPrice * line.quantity;
      const discountShare = totals.grossAmount > 0 ? Math.round(totals.discountAmount * subtotal / totals.grossAmount) : 0;
      return { order_id: orderId, product_id: line.productId, option_id: line.optionId ?? null, product_name_snapshot: line.productName, option_name_snapshot: line.optionName ?? null, unit_price: line.unitPrice, quantity: line.quantity, subtotal, commissionable_amount: Math.max(0, subtotal - discountShare) };
    }));
    if (itemError) fail(500, '주문 상품을 저장하지 못했습니다.');
    for (const line of lines) {
      const { data: reserved, error: reserveError } = await client.rpc('reserve_inventory', { p_product_id: line.productId, p_quantity: line.quantity });
      if (reserveError || !reserved) fail(409, `${line.productName} 재고가 방금 소진되었습니다.`);
      reservedLines.push(line);
    }
    verifiedPayment = await payment.verifyPayment({ paymentId: paymentSession.paymentId, orderId, amount: totals.paidAmount });
    const { error: paymentError } = await client.from('payments').insert({ order_id: orderId, provider: 'mock', provider_payment_id: verifiedPayment.paymentId, status: 'paid', amount: verifiedPayment.amount, paid_at: verifiedPayment.paidAt, raw_payload: verifiedPayment as unknown as Json });
    if (paymentError) fail(500, '결제 검증 결과를 저장하지 못했습니다.');
    const { error: paidError } = await client.from('orders').update({ status: 'paid', paid_at: verifiedPayment.paidAt }).eq('id', orderId);
    if (paidError) fail(500, '주문 결제상태를 갱신하지 못했습니다.');
    const commissions = calculateTwoDepthCommissions({ orderId, buyerUserId, commissionableAmount: totals.commissionableAmount, createdAt: verifiedPayment.paidAt, rule: getCommissionRule() }, { getReferrer: (userId) => lookup.get(userId) });
    if (commissions.commissions.length > 0) {
      const { error: commissionError } = await client.from('commissions').insert(commissions.commissions.map((commission) => ({ order_id: orderId, buyer_user_id: commission.buyerUserId, beneficiary_user_id: commission.beneficiaryUserId, depth: commission.depth, commission_base: commission.commissionBase, commission_rate: commission.commissionRate, commission_amount: commission.commissionAmount, status: commission.status })));
      if (commissionError) fail(500, 'Commission을 저장하지 못했습니다.');
    }
    if (promotion) {
      const { data: redeemed, error: redemptionError } = await client.rpc('redeem_promotion_code', { p_promotion_code_id: promotion.id, p_user_id: buyerUserId, p_order_id: orderId, p_discount_amount: totals.discountAmount });
      if (redemptionError || !redeemed) fail(409, 'Promotion Code 사용 한도가 방금 소진되었습니다.');
    }
    await client.from('analytics_events').insert({ user_id: buyerUserId, event_name: 'order_paid', referral_code: referral.code, referrer_user_id: referral.owner_user_id, properties: { order_id: orderId, amount: totals.paidAmount, commission_amount: commissions.commissions.reduce((sum, commission) => sum + commission.commissionAmount, 0) } });
    return { orderId, orderNumber, payment: verifiedPayment, totals, commissionPreview: commissions.commissions.map(({ depth, beneficiaryName, commissionAmount, status }) => ({ depth, beneficiaryName, commissionAmount, status })) };
  } catch (error) {
    if (verifiedPayment) await payment.refundPayment({ paymentId: verifiedPayment.paymentId, amount: verifiedPayment.amount, reason: '주문 저장 후속 처리 실패' });
    await Promise.all(reservedLines.map((line) => client.rpc('release_inventory', { p_product_id: line.productId, p_quantity: line.quantity })));
    if (orderCreated) {
      await client.from('commissions').update({ status: 'reversed' }).eq('order_id', orderId).in('status', ['pending', 'approved', 'payable']);
      await client.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', orderId).in('status', ['payment_pending', 'paid']);
    }
    throw error;
  }
}
