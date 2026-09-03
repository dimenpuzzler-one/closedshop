import { z } from 'zod';

export { romanizeKorean, slugify, nextSlugCandidate } from './slug';

export const referralCodeSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
});

export const signupSchema = z
  .object({
    email: z.string().trim().email('올바른 이메일 주소를 입력해 주세요.'),
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력해 주세요.'),
    displayName: z.string().trim().min(1, '이름을 입력해 주세요.').max(80, '이름은 80자를 넘을 수 없습니다.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '비밀번호가 일치하지 않습니다.',
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
  senderName: z.string().trim().min(1).max(80).optional(),
  senderPhone: z.string().trim().min(7).max(30).optional(),
  postalCode: z.string().trim().min(3).max(12),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  deliveryMessage: z.string().trim().max(200).optional(),
});

export const savedAddressSchema = addressSchema.extend({
  label: z.string().trim().min(1).max(40),
  postalCode: z.string().trim().regex(/^\d{5}$/, '5자리 우편번호를 입력해 주세요.'),
  addressLine2: z.string().trim().min(1).max(200),
  isDefault: z.boolean().optional(),
  jibunAddress: z.string().trim().max(200).optional(),
  buildingName: z.string().trim().max(200).optional(),
  sido: z.string().trim().max(80).optional(),
  sigungu: z.string().trim().max(80).optional(),
  eupmyeondong: z.string().trim().max(80).optional(),
  admCd: z.string().trim().max(20).optional(),
  roadNameCode: z.string().trim().max(30).optional(),
  buildingManagementNo: z.string().trim().max(40).optional(),
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
  shippingCompany: z.string().trim().min(1, '택배사를 입력해 주세요.').max(80).optional(),
  trackingNumber: z.string().trim().min(1, '운송장 번호를 입력해 주세요.').max(120).optional(),
}).superRefine((value, context) => {
  if (value.status !== 'shipped') return;
  if (!value.shippingCompany) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shippingCompany'], message: '배송 처리에는 택배사가 필요합니다.' });
  }
  if (!value.trackingNumber || value.trackingNumber === '입력 필요') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['trackingNumber'], message: '실제 운송장 번호를 입력해 주세요.' });
  }
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

const homeSortOrder = z
  .number({ invalid_type_error: '홈 진열 순서는 숫자로 입력해 주세요.' })
  .int('홈 진열 순서는 정수로 입력해 주세요.')
  .min(0, '홈 진열 순서는 0 이상이어야 합니다.')
  .max(9999, '홈 진열 순서는 9999 이하로 입력해 주세요.');

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
  basePrice: wonAmount('회원가'),
  onlinePrice: wonAmount('온라인가').optional(),
  shippingFee: wonAmount('배송비').default(0),
  withdrawalRestriction: z.string().trim().max(500, '청약철회 제한 안내는 500자를 넘을 수 없습니다.').default(''),
  visibility: z.enum(['public', 'member', 'referral', 'hidden'], {
    errorMap: () => ({ message: '노출 대상은 공개/회원 전용/추천 회원 전용/비공개 중에서 골라 주세요.' }),
  }).default('referral'),
  status: z.enum(['draft', 'active', 'paused', 'archived'], {
    errorMap: () => ({ message: '판매 상태는 즉시 판매/초안/판매 중지 중에서 골라 주세요.' }),
  }).default('draft'),
  optionName: z.string().trim().min(1, '옵션명을 입력해 주세요. (예: 구성)').max(80, '옵션명은 80자를 넘을 수 없습니다.'),
  optionValue: z.string().trim().min(1, '옵션값을 입력해 주세요. (예: 300g)').max(80, '옵션값은 80자를 넘을 수 없습니다.'),
  stock: wonAmount('초기재고'),
  homeSortOrder: homeSortOrder.optional(),
});

/** 등록 후 고칠 수 있어야 하는 항목들. 보낸 필드만 반영한다(부분 수정). */
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  basePrice: z.number().int().min(0).optional(),
  onlinePrice: z.number().int().min(0).nullable().optional(),
  shippingFee: z.number().int().min(0).optional(),
  withdrawalRestriction: z.string().trim().max(500, '청약철회 제한 안내는 500자를 넘을 수 없습니다.').optional(),
  visibility: z.enum(['public', 'member', 'referral', 'hidden']).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  optionName: z.string().trim().min(1, '옵션명을 입력해 주세요.').max(80, '옵션명은 80자를 넘을 수 없습니다.').optional(),
  optionValue: z.string().trim().min(1, '옵션값을 입력해 주세요.').max(80, '옵션값은 80자를 넘을 수 없습니다.').optional(),
  stock: z.number().int().min(0).optional(),
  homeSortOrder: homeSortOrder.optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: '변경할 항목이 없습니다.',
});

export const shippingSettingsSchema = z.object({
  shippingCutoffTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '배송 마감 시간은 HH:MM 형식이어야 합니다.'),
});

/**
 * 운영자가 관리자 화면에서 바꾸는 값 전부.
 * 보낸 필드만 반영한다 — 배송 탭만 저장했는데 홈 문구가 지워지면 안 된다.
 */
export const storeSettingsSchema = z.object({
  shippingCutoffTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '배송 마감 시간은 HH:MM 형식이어야 합니다.')
    .optional(),
  shippingFeePerCarton: z
    .number({ invalid_type_error: '배송비는 숫자로 입력해 주세요.' })
    .int('배송비는 원 단위 정수로 입력해 주세요.')
    .min(0, '배송비는 0원 이상이어야 합니다.')
    .max(1_000_000, '배송비가 너무 큽니다.')
    .optional(),
  shippingCartonQuantity: z
    .number({ invalid_type_error: '묶음 수량은 숫자로 입력해 주세요.' })
    .int('묶음 수량은 정수로 입력해 주세요.')
    .min(1, '묶음 수량은 1개 이상이어야 합니다.')
    .max(1000, '묶음 수량이 너무 큽니다.')
    .optional(),
  // null은 "무료배송 없음", 숫자는 그 금액 이상 무료배송. 둘은 다른 뜻이다.
  freeShippingThreshold: z
    .number({ invalid_type_error: '무료배송 기준액은 숫자로 입력해 주세요.' })
    .int('무료배송 기준액은 원 단위 정수로 입력해 주세요.')
    .min(0, '무료배송 기준액은 0원 이상이어야 합니다.')
    .nullable()
    .optional(),
  heroHeadline: z.string().trim().max(120, '메인 문구는 120자를 넘을 수 없습니다.').optional(),
  heroSubheadline: z.string().trim().max(300, '메인 설명은 300자를 넘을 수 없습니다.').optional(),
  heroYoutubeUrl: z
    .string()
    .trim()
    .max(300, '유튜브 주소가 너무 깁니다.')
    .refine(
      (value) => value === '' || /^https:\/\/(?:www\.)?(?:youtube\.com\/|youtu\.be\/)/.test(value),
      '유튜브 주소만 넣을 수 있습니다. (https://www.youtube.com/... 또는 https://youtu.be/...)',
    )
    .optional(),
  heroSlideIntervalSeconds: z
    .number({ invalid_type_error: '배너 전환 시간은 숫자로 입력해 주세요.' })
    .int('배너 전환 시간은 초 단위 정수로 입력해 주세요.')
    .min(2, '배너 전환 시간은 2초 이상이어야 합니다.')
    .max(30, '배너 전환 시간은 30초 이하여야 합니다.')
    .optional(),
  siteTheme: z.enum(['dealkey_gold', 'warm_beige', 'clean_white']).optional(),
  siteWidth: z.enum(['standard', 'wide']).optional(),
  siteDensity: z.enum(['compact', 'balanced', 'spacious']).optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: '변경할 항목이 없습니다.',
});

const homeBannerPathSchema = z
  .string()
  .regex(/^banners\/[0-9a-f-]+\.(?:jpg|png|webp)$/, '배너 저장 경로가 올바르지 않습니다.');

const homeBannerSortOrderSchema = z
  .number({ invalid_type_error: '배너 순서는 숫자로 입력해 주세요.' })
  .int('배너 순서는 정수로 입력해 주세요.')
  .min(0, '배너 순서는 0 이상이어야 합니다.')
  .max(9999, '배너 순서는 9999 이하여야 합니다.');

/** Storage 업로드가 끝난 배너를 홈 구성에 등록할 때 사용한다. */
export const homeBannerCommitSchema = z.object({
  path: homeBannerPathSchema,
  altText: z.string().trim().max(160, '배너 설명은 160자를 넘을 수 없습니다.').default(''),
  sortOrder: homeBannerSortOrderSchema.default(100),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
});

/** 배너 파일은 그대로 두고 순서·노출·설명만 수정한다. */
export const homeBannerUpdateSchema = z.object({
  altText: z.string().trim().max(160, '배너 설명은 160자를 넘을 수 없습니다.').optional(),
  sortOrder: homeBannerSortOrderSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: '변경할 배너 항목이 없습니다.',
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, '카테고리 이름을 입력해 주세요.').max(80, '카테고리 이름은 80자를 넘을 수 없습니다.'),
  /** 비우면 대분류, 채우면 그 대분류의 소분류가 된다. 2단계까지만 허용된다. */
  parentName: z.string().trim().max(80).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const refundSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export const referralCreateSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Z0-9_-]+$/i, '코드는 영문·숫자·하이픈·밑줄만 쓸 수 있습니다.'),
  ownerUserId: z.string().uuid('소유자 User ID는 UUID 형식이어야 합니다.'),
  /** 코드의 용도. 코드만 쌓이면 어느 게 릴스용이고 어느 게 지인용인지 알 수 없다. */
  label: z.string().trim().max(80, '용도는 80자를 넘을 수 없습니다.').optional(),
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
export type SavedAddressInput = z.infer<typeof savedAddressSchema>;
export type CartQuoteInput = z.infer<typeof cartQuoteSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CreateB2BLeadInput = z.infer<typeof b2bLeadSchema>;
