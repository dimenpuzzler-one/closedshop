import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/product-images/**' }],
  },
  transpilePackages: [
    '@closed-commerce/analytics',
    '@closed-commerce/auth',
    '@closed-commerce/commerce',
    '@closed-commerce/config',
    '@closed-commerce/db',
    '@closed-commerce/payment',
    '@closed-commerce/referral',
    '@closed-commerce/types',
    '@closed-commerce/ui',
    '@closed-commerce/validation',
  ],
};

export default nextConfig;
