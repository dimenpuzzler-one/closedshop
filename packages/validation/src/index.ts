import { z } from 'zod';

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

export const orderCreateSchema = z.object({
  buyerUserId: z.string().min(1),
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

export const productCreateSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(160),
  shortDescription: z.string().trim().max(300).default(''),
  description: z.string().trim().max(4000).default(''),
  basePrice: z.number().int().min(0),
  supplyCost: z.number().int().min(0).optional(),
  shippingFee: z.number().int().min(0).default(0),
  visibility: z.enum(['public', 'member', 'referral', 'hidden']).default('referral'),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
  optionName: z.string().trim().min(1).max(80),
  optionValue: z.string().trim().min(1).max(80),
  optionPrice: z.number().int().min(0).optional(),
  stock: z.number().int().min(0),
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
export type CreateB2BLeadInput = z.infer<typeof b2bLeadSchema>;
