import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Storage 원본은 유지하고, 고객 브라우저에는 WebP 파생본을 우선 제공한다.
    formats: ['image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/product-images/**' }],
  },
  transpilePackages: [
    '@closed-commerce/analytics',
    '@closed-commerce/auth',
    '@closed-commerce/commerce',
    '@closed-commerce/config',
    '@closed-commerce/db',
    '@closed-commerce/observability',
    '@closed-commerce/payment',
    '@closed-commerce/referral',
    '@closed-commerce/types',
    '@closed-commerce/ui',
    '@closed-commerce/validation',
  ],
};

export default nextConfig;
