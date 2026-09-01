import { randomUUID } from 'node:crypto';
import { getCommissionRule } from '@closed-commerce/config';
import {
  allocateDiscount,
  calculateCartTotalsFromLines,
  DEFAULT_SHIPPING_POLICY,
  type CatalogLine,
  type ShippingPolicy,
} from '@closed-commerce/commerce';
import { createServiceRoleSupabaseClient, type AppSupabaseClient } from '@closed-commerce/db';
import {
  describeKorpayCode,
  korpayIssuerName,
  toKorpayOrderNumber,
  type KorpayApproval,
  type KorpayCheckoutParams,
  KorpayError,
} from '@closed-commerce/payment';
import { logServerError, logServerEvent } from '@closed-commerce/observability';
import { calculateTwoDepthCommissions } from '@closed-commerce/referral';
import type { CommissionSnapshot, Product, PromotionCode, ReferralNode } from '@closed-commerce/types';
import type { CreateOrderInput } from '@closed-commerce/validation';
import { getKorpayProvider, korpayReturnUrl } from '@/lib/korpay-config';

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

/**
 * 결제 전 단계의 결과.
 * 주문은 저장되고 재고도 잡혔지만 아직 돈은 빠지지 않았다.
 */
export interface PreparedOrderResult {
  orderId: string;
  orderNumber: string;
  amount: number;
  checkoutParams: KorpayCheckoutParams;
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
    // status만 보고 visibility를 보지 않으면, 판매를 내린 hidden 상품도 id만 알면 주문된다.
    // service role은 RLS(products_visible_read)를 우회하므로 여기서 직접 막는다.
    client.from('products').select('id, slug, name, category, short_description, description, base_price, supply_cost, shipping_fee, visibility, status, created_at').in('id', productIds).eq('status', 'active').neq('visibility', 'hidden'),
    client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds),
    client.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds),
  ]);
  if (productError || optionError || inventoryError) fail(500, '상품 정보를 불러오지 못했습니다.');
  if ((products?.length ?? 0) !== productIds.length) {
    const found = new Set((products ?? []).map((product) => product.id));
    const missing = productIds.filter((id) => !found.has(id));
    fail(400, `판매 중인 상품이 아니거나 상품을 찾을 수 없습니다. (${missing.length}건)`);
  }
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
    category: product.category,
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

/**
 * 배송비 규칙을 store_settings에서 읽는다.
 * 여기서는 service role 클라이언트를 이미 쥐고 있으므로 그대로 쓴다.
 * 설정을 못 읽으면 배송비를 0으로 떨어뜨리지 말고 기본 정책으로 되돌린다 —
 * 조용히 0원이 되면 판매자가 3PL 비용을 전액 부담한다.
 */
async function loadShippingPolicy(client: ReturnType<typeof createServiceRoleSupabaseClient>): Promise<ShippingPolicy> {
  const { data, error } = await client
    .from('store_settings')
    .select('shipping_fee_per_carton, shipping_carton_quantity, free_shipping_threshold')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SHIPPING_POLICY;
  return {
    cartonQuantity: data.shipping_carton_quantity ?? DEFAULT_SHIPPING_POLICY.cartonQuantity,
    feePerCarton: data.shipping_fee_per_carton ?? DEFAULT_SHIPPING_POLICY.feePerCarton,
    freeShippingThreshold: data.free_shipping_threshold ?? undefined,
  };
}

/**
 * 1단계: 주문을 만들고 재고를 잡는다. 아직 결제는 하지 않는다.
 *
 * 예전에는 이 함수 하나가 주문 생성부터 결제 승인까지 다 했다. 코페이 인증결제는
 * 고객이 카드사 화면을 거쳐 돌아오는 리다이렉트 방식이라 한 번의 서버 호출로 끝낼 수 없다.
 * 여기서는 "결제하면 팔 수 있는 상태"까지만 만들고, 실제 승인은 리턴 URL에서 한다.
 */
export async function prepareOrder(
  input: CreateOrderInput,
  buyerUserId: string,
  requestId = 'no-request-id',
): Promise<PreparedOrderResult> {
  const client = createServiceRoleSupabaseClient();
  // 재고를 세기 전에, 결제를 끝내지 않고 나간 주문이 붙잡고 있는 자리를 먼저 되돌린다.
  // 정기 작업(pg_cron)이 5분마다 돌지만, 방금 결제창을 닫고 다시 들어온 고객이
  // 자기 예약에 자기가 막혀 "재고가 부족합니다"를 보는 일을 그 사이에 겪게 된다.
  // 쓸어내기가 실패해도 주문 자체는 계속 진행한다. 없어도 되는 보조 작업이다.
  const { error: sweepError } = await client.rpc('expire_stale_pending_orders', { p_minutes: 20 });
  if (sweepError) logServerError('order.prepare', requestId, sweepError, { stage: 'expire_stale' });

  const { referral } = await loadReferral(client, buyerUserId, input.referralCode);
  const { lines } = await loadCatalog(client, input);
  const promotion = await loadPromotion(client, input, buyerUserId, referral.id);
  const shippingPolicy = await loadShippingPolicy(client);
  const totals = calculateCartTotalsFromLines(lines, promotion, shippingPolicy);
  if (promotion && (promotion.rule.discountRate !== undefined || promotion.rule.discountAmount !== undefined) && totals.discountAmount === 0) {
    fail(400, 'Promotion Code의 조건을 충족하지 않았습니다.');
  }
  if (totals.paidAmount < 1000) {
    // 코페이 최소 결제 금액. 이 아래로는 결제창 자체가 열리지 않는다.
    fail(400, '결제 금액이 최소 결제 금액(1,000원)보다 적습니다.');
  }

  const orderId = randomUUID();
  // 코페이는 주문번호에 영문과 숫자만 허용한다. 하이픈이 들어가면 결제창이 열리지 않는다.
  const orderNumber = toKorpayOrderNumber(
    `DK${new Date().toISOString().slice(0, 10).replaceAll('-', '')}${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`,
  );

  const reservedLines: CatalogLine[] = [];
  let orderCreated = false;
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
      address_snapshot: input.address,
    });
    if (orderError) fail(500, '주문을 저장하지 못했습니다.');
    orderCreated = true;

    const discountShares = allocateDiscount(lines, totals.grossAmount, totals.discountAmount);
    const { error: itemError } = await client.from('order_items').insert(lines.map((line, index) => {
      const subtotal = line.unitPrice * line.quantity;
      const discountShare = discountShares[index] ?? 0;
      return {
        order_id: orderId,
        product_id: line.productId,
        option_id: line.optionId ?? null,
        product_name_snapshot: line.productName,
        option_name_snapshot: line.optionName ?? null,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        subtotal,
        commissionable_amount: Math.max(0, subtotal - discountShare),
      };
    }));
    if (itemError) fail(500, '주문 상품을 저장하지 못했습니다.');

    for (const line of lines) {
      const { data: reserved, error: reserveError } = await client.rpc('reserve_inventory', { p_product_id: line.productId, p_quantity: line.quantity });
      if (reserveError || !reserved) fail(409, `${line.productName} 재고가 방금 소진되었습니다.`);
      reservedLines.push(line);
    }

    const firstLine = lines[0];
    const productName = lines.length > 1 && firstLine
      ? `${firstLine.productName} 외 ${lines.length - 1}건`
      : firstLine?.productName ?? '딜키 주문';

    const checkoutParams = getKorpayProvider().buildCheckoutParams({
      orderNumber,
      productName,
      amount: totals.paidAmount,
      returnUrl: korpayReturnUrl(),
      customerName: input.address.senderName || input.address.recipientName,
      customerPhone: input.address.senderPhone || input.address.phone,
      customerAddress: `${input.address.addressLine1} ${input.address.addressLine2 ?? ''}`.trim(),
      customerPost: input.address.postalCode,
    });

    logServerEvent('order.prepare', requestId, { stage: 'ready', orderId, orderNumber, amount: totals.paidAmount });
    return { orderId, orderNumber, amount: totals.paidAmount, checkoutParams };
  } catch (error) {
    logServerError('order.prepare', requestId, error, { stage: 'rollback', orderId, reservedCount: reservedLines.length });
    await releaseReservations(client, reservedLines, orderId, requestId);
    if (orderCreated) {
      const { error: cancelError } = await client.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'payment_pending');
      if (cancelError) logServerError('order.prepare', requestId, cancelError, { stage: 'order_cancel', orderId });
    }
    throw error;
  }
}

async function releaseReservations(client: AppSupabaseClient, lines: CatalogLine[], orderId: string, requestId: string) {
  const released = await Promise.all(lines.map((line) => client.rpc('release_inventory', { p_product_id: line.productId, p_quantity: line.quantity })));
  released.forEach((result, index) => {
    if (result.error) logServerError('order.compensate', requestId, result.error, { stage: 'release_inventory', orderId, itemIndex: index });
  });
}

/** 결제대기 주문에 걸린 재고를 되돌리고 주문을 취소 처리한다. */
export async function cancelPendingOrder(orderNumber: string, reason: string, requestId = 'no-request-id'): Promise<void> {
  const client = createServiceRoleSupabaseClient();
  const { data: order } = await client.from('orders').select('id, status').eq('order_number', orderNumber).maybeSingle();
  // 이미 결제된 주문을 실수로 취소하면 안 된다.
  if (!order || order.status !== 'payment_pending') return;

  const { data: items } = await client.from('order_items').select('product_id, quantity').eq('order_id', order.id);
  await releaseReservations(
    client,
    (items ?? []).map((item) => ({ productId: item.product_id, quantity: item.quantity } as CatalogLine)),
    order.id,
    requestId,
  );
  await client.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', order.id).eq('status', 'payment_pending');
  logServerEvent('order.cancel', requestId, { orderId: order.id, orderNumber, reason });
}

/**
 * 2단계: 코페이 승인을 받고 주문을 확정한다.
 *
 * 리턴 URL은 고객 브라우저가 POST하는 주소라 두 번 들어올 수 있고, 값도 위조될 수 있다.
 * 그래서 넘어온 금액을 믿지 않고 우리 DB에 저장된 주문 금액과 대조한 뒤 승인을 요청한다.
 */
export async function finalizeKorpayOrder(
  input: { orderNumber: string; paymentKey: string; amount?: string },
  requestId = 'no-request-id',
): Promise<PersistedOrderResult> {
  const client = createServiceRoleSupabaseClient();
  const { data: order, error: orderError } = await client
    .from('orders')
    .select('id, order_number, status, buyer_user_id, referrer_user_id, referral_code, promotion_code, gross_amount, discount_amount, shipping_amount, paid_amount, commissionable_amount, paid_at')
    .eq('order_number', input.orderNumber)
    .maybeSingle();
  if (orderError) fail(500, '주문을 조회하지 못했습니다.');
  if (!order) fail(404, '주문을 찾을 수 없습니다.');

  // 리턴 URL이 두 번 들어와도 두 번 승인하지 않는다.
  if (order.status !== 'payment_pending') {
    if (order.status === 'paid' || order.status === 'preparing' || order.status === 'shipped' || order.status === 'delivered') {
      const { data: payment } = await client.from('payments').select('provider_payment_id, amount, paid_at').eq('order_id', order.id).maybeSingle();
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        payment: {
          paymentId: payment?.provider_payment_id ?? input.paymentKey,
          orderId: order.id,
          amount: payment?.amount ?? order.paid_amount,
          status: 'paid',
          paidAt: payment?.paid_at ?? order.paid_at ?? new Date().toISOString(),
        },
        totals: {
          grossAmount: order.gross_amount,
          discountAmount: order.discount_amount,
          shippingAmount: order.shipping_amount,
          paidAmount: order.paid_amount,
          commissionableAmount: order.commissionable_amount,
          quantity: 0,
        },
        commissionPreview: [],
      };
    }
    fail(409, '이미 취소되었거나 결제할 수 없는 주문입니다.');
  }

  // 코페이가 돌려준 금액은 참고만 한다. 승인 기준은 우리 DB의 금액이다.
  if (input.amount !== undefined && Number(input.amount) !== order.paid_amount) {
    logServerError('order.finalize', requestId, new Error('amount mismatch'), {
      orderId: order.id,
      expected: order.paid_amount,
      received: input.amount,
    });
    await cancelPendingOrder(order.order_number, 'amount mismatch', requestId);
    fail(400, '결제 금액이 주문 금액과 일치하지 않아 결제를 중단했습니다.');
  }

  /*
   * 승인 요청 전에 자리를 먼저 잡는다.
   *
   * 리턴 URL은 고객 브라우저가 POST하는 주소라 새로고침이나 중복 전송으로 두 번 들어올 수 있다.
   * 위의 상태 검사만으로는 두 요청이 동시에 통과할 수 있고, 그러면 승인 API를 두 번 불러
   * 이중 청구가 날 수 있다. payments에는 order_id UNIQUE 제약이 있으므로 pending 행을
   * 먼저 넣어, 이긴 요청만 승인을 진행하게 한다.
   */
  const { error: claimError } = await client.from('payments').insert({
    order_id: order.id,
    provider: 'korpay',
    provider_payment_id: input.paymentKey,
    status: 'pending',
    amount: order.paid_amount,
  });
  if (claimError) {
    // 23505 = unique_violation. 다른 요청이 이미 이 주문의 결제를 처리하고 있다.
    if (claimError.code === '23505') {
      logServerEvent('order.finalize', requestId, { stage: 'duplicate_return', orderId: order.id });
      fail(409, '이미 처리 중인 결제입니다. 주문 조회에서 결과를 확인해 주세요.');
    }
    logServerError('order.finalize', requestId, claimError, { stage: 'payment_claim', orderId: order.id });
    fail(500, '결제를 시작하지 못했습니다.');
  }

  let approval: KorpayApproval;
  try {
    approval = await getKorpayProvider().confirm(input.paymentKey);
  } catch (error) {
    const korpayError = error instanceof KorpayError ? error : undefined;
    logServerError('order.finalize', requestId, error, { stage: 'confirm', orderId: order.id, code: korpayError?.code });
    // 승인이 안 됐으니 잡아둔 자리와 재고를 모두 되돌린다.
    // 재고를 안 풀면 팔 수 있는 물건이 조용히 줄어든다.
    const { error: cleanupError } = await client.from('payments').delete().eq('order_id', order.id).eq('status', 'pending');
    if (cleanupError) logServerError('order.finalize', requestId, cleanupError, { stage: 'payment_claim_cleanup', orderId: order.id });
    await cancelPendingOrder(order.order_number, korpayError?.code ?? 'confirm failed', requestId);
    fail(402, korpayError?.message ?? describeKorpayCode(undefined));
  }

  if (approval.amount !== undefined && approval.amount !== order.paid_amount) {
    logServerError('order.finalize', requestId, new Error('approved amount mismatch'), {
      orderId: order.id,
      expected: order.paid_amount,
      approved: approval.amount,
    });
    fail(500, `승인 금액(${approval.amount}원)이 주문 금액(${order.paid_amount}원)과 다릅니다. 고객센터로 문의해 주세요.`);
  }

  const paidAt = new Date().toISOString();
  const issuer = korpayIssuerName(approval.card?.approvalCode);
  // 위에서 잡아둔 pending 행을 확정으로 바꾼다.
  const { error: paymentError } = await client
    .from('payments')
    .update({
      provider_payment_id: approval.tid ?? input.paymentKey,
      status: 'paid',
      amount: approval.amount ?? order.paid_amount,
      paid_at: paidAt,
      // 승인 응답 원문을 그대로 남긴다. 카드사 분쟁 시 이 기록이 근거가 된다.
      raw_payload: { ...approval, issuer },
    })
    .eq('order_id', order.id);
  if (paymentError) {
    // 돈은 빠졌는데 기록이 없다. 절대 조용히 넘어가면 안 된다.
    logServerError('order.finalize', requestId, paymentError, { stage: 'payment_insert', orderId: order.id, tid: approval.tid });
    fail(500, '결제는 완료됐지만 기록에 실패했습니다. 고객센터로 문의해 주세요.');
  }

  const { error: paidError } = await client.from('orders').update({ status: 'paid', paid_at: paidAt }).eq('id', order.id).eq('status', 'payment_pending');
  if (paidError) fail(500, '주문 결제상태를 갱신하지 못했습니다.');

  const { lookup } = await loadReferral(client, order.buyer_user_id, order.referral_code ?? undefined);
  const commissions = calculateTwoDepthCommissions(
    { orderId: order.id, buyerUserId: order.buyer_user_id, commissionableAmount: order.commissionable_amount, createdAt: paidAt, rule: getCommissionRule() },
    { getReferrer: (userId) => lookup.get(userId) },
  );
  if (commissions.commissions.length > 0) {
    const { error: commissionError } = await client.from('commissions').insert(commissions.commissions.map((commission) => ({
      order_id: order.id,
      buyer_user_id: commission.buyerUserId,
      beneficiary_user_id: commission.beneficiaryUserId,
      depth: commission.depth,
      commission_base: commission.commissionBase,
      commission_rate: commission.commissionRate,
      commission_amount: commission.commissionAmount,
      status: commission.status,
    })));
    // 결제는 이미 끝났다. 커미션 저장 실패로 주문을 되돌리면 고객이 돈만 내고 주문이 사라진다.
    if (commissionError) logServerError('order.finalize', requestId, commissionError, { stage: 'commission_insert', orderId: order.id });
  }

  if (order.promotion_code) {
    const { data: promotionRow } = await client.from('promotion_codes').select('id').eq('code', order.promotion_code).maybeSingle();
    if (promotionRow) {
      const { error: redemptionError } = await client.rpc('redeem_promotion_code', {
        p_promotion_code_id: promotionRow.id,
        p_user_id: order.buyer_user_id,
        p_order_id: order.id,
        p_discount_amount: order.discount_amount,
      });
      if (redemptionError) logServerError('order.finalize', requestId, redemptionError, { stage: 'promotion_redeem', orderId: order.id });
    }
  }

  logServerEvent('order.finalize', requestId, { stage: 'paid', orderId: order.id, orderNumber: order.order_number, tid: approval.tid, paidAmount: order.paid_amount });
  await client.from('analytics_events').insert({
    user_id: order.buyer_user_id,
    event_name: 'order_paid',
    referral_code: order.referral_code,
    referrer_user_id: order.referrer_user_id,
    properties: { order_id: order.id, amount: order.paid_amount, tid: approval.tid ?? null },
  });

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    payment: { paymentId: approval.tid ?? input.paymentKey, orderId: order.id, amount: approval.amount ?? order.paid_amount, status: 'paid', paidAt },
    totals: {
      grossAmount: order.gross_amount,
      discountAmount: order.discount_amount,
      shippingAmount: order.shipping_amount,
      paidAmount: order.paid_amount,
      commissionableAmount: order.commissionable_amount,
      quantity: 0,
    },
    commissionPreview: commissions.commissions.map(({ depth, beneficiaryName, commissionAmount, status }) => ({ depth, beneficiaryName, commissionAmount, status })),
  };
}
