import { DEMO_REFERRAL_CODES, getProductBySlug, getVisibleProducts } from '@closed-commerce/commerce';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { findValidReferralCode } from '@closed-commerce/referral';
import type { Product, ProductImage } from '@closed-commerce/types';
import { createServerAppClient } from '@/lib/supabase-server';

function mapProduct(row: { id: string; slug: string; name: string; short_description: string; description: string; base_price: number; shipping_fee: number; visibility: Product['visibility']; status: Product['status'] }, options: { id: string; name: string; value: string; price: number; stock: number }[], images: ProductImage[] = []): Product {
  return { id: row.id, slug: row.slug, name: row.name, shortDescription: row.short_description, description: row.description, weight: options[0]?.value ?? '', price: options[0]?.price ?? row.base_price, shippingFee: row.shipping_fee, visibility: row.visibility, status: row.status, imageUrl: images[0]?.url ?? '', images, options, tags: [] };
}

export async function loadVisibleCatalog(referralCode?: string): Promise<{ products: Product[]; validReferralCode?: string; authenticated: boolean }> {
  if (!hasSupabaseEnv()) {
    const valid = referralCode ? findValidReferralCode(DEMO_REFERRAL_CODES, referralCode) : undefined;
    return { products: getVisibleProducts(true, Boolean(valid)), validReferralCode: valid?.code, authenticated: true };
  }
  const client = await createServerAppClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { products: [], authenticated: false };
  const { data: relationship } = await client.from('referral_relationships').select('referral_code_id').eq('referred_user_id', auth.user.id).maybeSingle();
  let validReferralCode: string | undefined;
  if (relationship) {
    const { data: code } = await client.from('referral_codes').select('code').eq('id', relationship.referral_code_id).eq('status', 'active').maybeSingle();
    validReferralCode = code?.code;
  }
  const { data: rows, error } = await client.from('products').select('id, slug, name, short_description, description, base_price, shipping_fee, visibility, status, created_at').eq('status', 'active');
  if (error || !rows || rows.length === 0) return { products: [], validReferralCode, authenticated: true };
  const productIds = rows.map((row) => row.id);
  const [{ data: options }, { data: inventories }, { data: imageRows }] = await Promise.all([
    productIds.length ? client.from('product_options').select('id, product_id, name, value, price').in('product_id', productIds) : Promise.resolve({ data: [] }),
    productIds.length ? client.from('inventory').select('product_id, quantity, reserved_quantity').in('product_id', productIds) : Promise.resolve({ data: [] }),
    productIds.length ? client.from('product_images').select('id, product_id, storage_path, alt_text, sort_order, created_at').in('product_id', productIds).order('sort_order') : Promise.resolve({ data: [] }),
  ]);
  const stockByProduct = new Map((inventories ?? []).map((item) => [item.product_id, Math.max(0, item.quantity - item.reserved_quantity)]));
  const imagesByProduct = new Map<string, ProductImage[]>();
  (imageRows ?? []).forEach((image) => {
    const url = client.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl;
    const current = imagesByProduct.get(image.product_id) ?? [];
    current.push({ id: image.id, url, altText: image.alt_text, sortOrder: image.sort_order });
    imagesByProduct.set(image.product_id, current);
  });
  const products = rows.map((row) => {
    const rowOptions = (options ?? [])
      .filter((option) => option.product_id === row.id)
      .map((option) => ({ id: option.id, name: option.name, value: option.value, price: option.price, stock: stockByProduct.get(row.id) ?? 0 }));
    return mapProduct(row, rowOptions, imagesByProduct.get(row.id));
  });
  return { products, validReferralCode, authenticated: true };
}

export async function loadProductBySlug(slug: string, referralCode?: string): Promise<{ product?: Product; validReferralCode?: string; authenticated: boolean }> {
  if (!hasSupabaseEnv()) {
    const catalog = await loadVisibleCatalog(referralCode);
    return { product: getProductBySlug(slug), validReferralCode: catalog.validReferralCode, authenticated: true };
  }
  const catalog = await loadVisibleCatalog(referralCode);
  return { product: catalog.products.find((product) => product.slug === slug), validReferralCode: catalog.validReferralCode, authenticated: catalog.authenticated };
}
