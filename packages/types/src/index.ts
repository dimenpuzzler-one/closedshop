export type Id = string;

export type ProductVisibility = 'public' | 'member' | 'referral' | 'hidden';
export type ProductStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface ProductOption {
  id: Id;
  name: string;
  value: string;
  price: number;
  stock: number;
}

export interface ProductImage {
  id: Id;
  url: string;
  altText: string;
  sortOrder: number;
}

export interface Product {
  id: Id;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  weight: string;
  price: number;
  supplyCost?: number;
  shippingFee: number;
  visibility: ProductVisibility;
  status: ProductStatus;
  imageUrl: string;
  images?: ProductImage[];
  options: ProductOption[];
  tags: string[];
  commissionableRate?: number;
}

export interface StoreSettings {
  shippingCutoffTime: string;
}

export interface ReferralCode {
  id: Id;
  code: string;
  ownerUserId: Id;
  ownerName: string;
  campaignId?: Id;
  status: 'active' | 'inactive' | 'expired';
  startsAt?: string;
  expiresAt?: string;
}

export interface ReferralRelationship {
  id: Id;
  referredUserId: Id;
  referrerUserId: Id;
  referralCodeId: Id;
  source: 'link' | 'manual' | 'admin';
  campaignId?: Id;
  createdAt: string;
}

export interface PromotionRule {
  productIds?: Id[];
  referralCodeIds?: Id[];
  minimumOrderAmount?: number;
  minimumQuantity?: number;
  discountRate?: number;
  discountAmount?: number;
}

export interface PromotionCode {
  id: Id;
  code: string;
  status: 'active' | 'inactive' | 'expired';
  startsAt?: string;
  expiresAt?: string;
  totalUsageLimit?: number;
  perMemberUsageLimit?: number;
  usageCount: number;
  rule: PromotionRule;
}

export interface CartItem {
  productId: Id;
  optionId?: Id;
  quantity: number;
}

export type OrderStatus =
  | 'pending'
  | 'payment_pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancel_requested'
  | 'cancelled'
  | 'refund_requested'
  | 'partially_refunded'
  | 'refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface AddressSnapshot {
  recipientName: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string;
  deliveryMessage?: string;
}

export interface OrderItem {
  id: Id;
  orderId: Id;
  productId: Id;
  productName: string;
  optionName?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  commissionableAmount: number;
}

export interface Order {
  id: Id;
  orderNumber: string;
  buyerUserId: Id;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  referralCode?: string;
  referrerUserId?: Id;
  grossAmount: number;
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
  commissionableAmount: number;
  promotionCode?: string;
  address: AddressSnapshot;
  items: OrderItem[];
  createdAt: string;
  paidAt?: string;
}

export type CommissionStatus = 'pending' | 'approved' | 'payable' | 'paid' | 'cancelled' | 'reversed';

export interface CommissionSnapshot {
  id: Id;
  orderId: Id;
  buyerUserId: Id;
  beneficiaryUserId: Id;
  beneficiaryName: string;
  depth: 1 | 2;
  commissionBase: number;
  commissionRate: number;
  commissionAmount: number;
  status: CommissionStatus;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
}

export interface CommissionRule {
  level1Rate: number;
  level2Rate: number;
  approvalDays: number;
}

export interface ReferralNode {
  userId: Id;
  name: string;
  referrerUserId?: Id;
}

export interface AttributionSnapshot {
  referralCode?: string;
  referrerUserId?: Id;
  campaignId?: Id;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingAt?: string;
  signupAt?: string;
  firstOrderAt?: string;
  orderAmount?: number;
  commissionAmount?: number;
}

export interface B2BLead {
  id: Id;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  requestedProduct: string;
  quantity: number;
  desiredDeliveryDate?: string;
  budget?: number;
  memo?: string;
  status: 'new' | 'contacted' | 'quoted' | 'closed';
  createdAt: string;
}
