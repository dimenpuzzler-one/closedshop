import { z } from 'zod';

export { romanizeKorean, slugify, nextSlugCandidate } from './slug';

export const referralCodeSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
});

export const promotionCodeSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
});

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  optionId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(99),
});

export const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(30),
  postalCode: z.string().trim().min(3).max(12),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  deliveryMessage: z.string().trim().max(200).optional(),
});

export const cartQuoteSchema = z.object({
  items: z.array(cartItemSchema).max(100),
  promotionCode: z.string().trim().max(32).optional(),
});

export const orderCreateSchema = z.object({
  /**
   * Supabase 모드에서는 서버가 세션 사용자로 덮어쓰므로 클라이언트가 보내지 않는다.
   * 데모 모드 호환을 위해서만 남겨둔 선택 필드다.
   */
  buyerUserId: z.string().min(1).optional(),
  items: z.array(cartItemSchema).min(1).max(100),
  referralCode: z.string().trim().max(32).optional(),
  promotionCode: z.string().trim().max(32).optional(),
  address: addressSchema,
});

export const b2bLeadSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(30),
  email: z.string().email(),
  requestedProduct: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().int().min(1).max(100000),
  desiredDeliveryDate: z.string().trim().max(30).optional(),
  budget: z.coerce.number().int().min(0).optional(),
  memo: z.string().trim().max(1000).optional(),
});

export const orderUpdateSchema = z.object({
  status: z.enum(['pending', 'payment_pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancel_requested', 'cancelled', 'refund_requested', 'partially_refunded', 'refunded']),
  shippingCompany: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
});

export const commissionUpdateSchema = z.object({
  status: z.enum(['pending', 'approved', 'payable', 'paid', 'cancelled', 'reversed']),
});

export const leadUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'quoted', 'closed']),
});

/**
 * 모든 메시지를 한국어로 명시한다.
 * 기본 메시지는 정규식 실패 시 "Invalid" 한 단어뿐이라, 화면에 "slug: Invalid"만 떴다.
 * 무엇이 잘못됐고 어떻게 고치면 되는지가 메시지 안에 들어 있어야 한다.
 */
const wonAmount = (label: string) =>
  z
    .number({ invalid_type_error: `${label}은(는) 숫자만 입력할 수 있습니다. 쉼표(,)나 "원"은 빼 주세요.` })
    .int(`${label}은(는) 소수점 없이 입력해 주세요.`)
    .min(0, `${label}은(는) 0 이상이어야 합니다.`);

export const productSlugSchema = z
  .string()
  .trim()
  .min(2, '상품 주소(slug)는 2자 이상이어야 합니다.')
  .max(120, '상품 주소(slug)는 120자를 넘을 수 없습니다.')
  .regex(
    /^[a-z0-9-]+$/,
    '상품 주소(slug)에는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있습니다. 한글·공백·대문자·밑줄(_)은 쓸 수 없습니다. 예: gift-set-500g',
  );

export const productCreateSchema = z.object({
  // 비워서 보내면 서버가 상품명에서 자동으로 만든다.
  slug: productSlugSchema.optional(),
  name: z.string().trim().min(1, '상품명을 입력해 주세요.').max(160, '상품명은 160자를 넘을 수 없습니다.'),
  category: z.string().trim().min(1, '카테고리를 입력해 주세요.').max(80, '카테고리는 80자를 넘을 수 없습니다.').default('기타'),
  shortDescription: z.string().trim().max(300, '짧은 소개는 300자를 넘을 수 없습니다.').default(''),
  description: z.string().trim().max(4000, '상세 설명은 4000자를 넘을 수 없습니다.').default(''),
  basePrice: wonAmount('기본가'),
  supplyCost: wonAmount('공급가').optional(),
  shippingFee: wonAmount('배송비').default(0),
  visibility: z.enum(['public', 'member', 'referral', 'hidden'], {
    errorMap: () => ({ message: '노출 대상은 공개/회원 전용/추천 회원 전용/비공개 중에서 골라 주세요.' }),
  }).default('referral'),
  status: z.enum(['draft', 'active', 'paused', 'archived'], {
    errorMap: () => ({ message: '판매 상태는 즉시 판매/초안/판매 중지 중에서 골라 주세요.' }),
  }).default('draft'),
  optionName: z.string().trim().min(1, '옵션명을 입력해 주세요. (예: 구성)').max(80, '옵션명은 80자를 넘을 수 없습니다.'),
  optionValue: z.string().trim().min(1, '옵션값을 입력해 주세요. (예: 300g)').max(80, '옵션값은 80자를 넘을 수 없습니다.'),
  optionPrice: wonAmount('옵션가').optional(),
  stock: wonAmount('초기재고'),
});

/** 등록 후 고칠 수 있어야 하는 항목들. 보낸 필드만 반영한다(부분 수정). */
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  basePrice: z.number().int().min(0).optional(),
  supplyCost: z.number().int().min(0).nullable().optional(),
  shippingFee: z.number().int().min(0).optional(),
  visibility: z.enum(['public', 'member', 'referral', 'hidden']).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  optionName: z.string().trim().min(1, '옵션명을 입력해 주세요.').max(80, '옵션명은 80자를 넘을 수 없습니다.').optional(),
  optionValue: z.string().trim().min(1, '옵션값을 입력해 주세요.').max(80, '옵션값은 80자를 넘을 수 없습니다.').optional(),
  optionPrice: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: '변경할 항목이 없습니다.',
});

export const shippingSettingsSchema = z.object({
  shippingCutoffTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '배송 마감 시간은 HH:MM 형식이어야 합니다.'),
});

export const refundSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export const referralCreateSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
  ownerUserId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
});

export const promotionCreateSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
  discountRate: z.number().min(0).max(1).optional(),
  discountAmount: z.number().int().min(0).optional(),
  minimumOrderAmount: z.number().int().min(0).optional(),
  minimumQuantity: z.number().int().min(1).optional(),
  totalUsageLimit: z.number().int().min(1).optional(),
  perMemberUsageLimit: z.number().int().min(1).optional(),
}).refine((value) => (value.discountRate !== undefined) !== (value.discountAmount !== undefined), { message: '할인율 또는 정액 할인 중 하나만 입력해야 합니다.' });

export type CreateOrderInput = z.infer<typeof orderCreateSchema>;
export type CartQuoteInput = z.infer<typeof cartQuoteSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CreateB2BLeadInput = z.infer<typeof b2bLeadSchema>;
