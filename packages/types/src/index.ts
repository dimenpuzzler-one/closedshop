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

/** 사진의 용도. 운영자가 등록 화면의 어느 칸에 넣었는지로 정해진다. */
export type ProductImageRole = 'thumbnail' | 'detail';

export interface ProductImage {
  id: Id;
  url: string;
  altText: string;
  sortOrder: number;
  /** thumbnail=목록 썸네일과 상세 상단, detail=상세페이지 본문. */
  role: ProductImageRole;
  width?: number;
  height?: number;
  byteSize?: number;
  mimeType?: string;
}

export interface Product {
  id: Id;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  weight: string;
  /** 회원에게 공개하는 특판가. */
  basePrice?: number;
  /** 비로그인 방문자에게 공개하는 온라인 기준가. */
  onlinePrice?: number;
  /** 홈 화면 진열 순서. 숫자가 작을수록 먼저 노출된다. */
  homeSortOrder?: number;
  price: number;
  shippingFee: number;
  /**
   * 청약철회가 제한되는 사유. 상품 상세에 표시된다.
   * 비어 있으면 제한을 주장할 수 없다(전자상거래법 제17조 제2항 단서).
   */
  withdrawalRestriction?: string;
  visibility: ProductVisibility;
  status: ProductStatus;
  imageUrl: string;
  images?: ProductImage[];
  /** Physical inventory, before subtracting reservations. Admin-only projection. */
  inventoryQuantity?: number;
  reservedQuantity?: number;
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
  label?: string;
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
  senderName?: string;
  senderPhone?: string;
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
