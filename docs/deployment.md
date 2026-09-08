# Vercel deployment

Create two Vercel projects from this repository:

- `closed-commerce-web`: Root Directory `apps/web`, `apps/web/vercel.json`
- `closed-commerce-admin`: Root Directory `apps/admin`, `apps/admin/vercel.json`

Both projects need the shared Supabase public variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_WEB_URL
```

The web project also needs these server-only variables for persisted orders, PayDataKR, and address lookup:

```text
SUPABASE_SERVICE_ROLE_KEY
PAYDATAKR_PUBLIC_KEY
PAYDATAKR_PAY_KEY
PAYDATAKR_API_BASE_URL
PAYDATAKR_RECEIPT_BASE_URL
JUSO_API_KEY
L1_COMMISSION_RATE
L2_COMMISSION_RATE
COMMISSION_APPROVAL_DAYS
```

The admin project also needs these server-only PayDataKR variables for refunds:

```text
PAYDATAKR_PAY_KEY
PAYDATAKR_API_BASE_URL
```

The web checkout loads the official PayDataKR v1.5 SDK from `https://api.paydatakr.com/js/clientside-1.1.0.js`; no checkout action URL environment variable is required. `PAYDATAKR_API_BASE_URL` defaults to `https://api.paydatakr.com`. Once the values are entered in the appropriate Vercel project environments and redeployed, the PayDataKR flow is enabled without another code change.

Never add `SUPABASE_SERVICE_ROLE_KEY` to a `NEXT_PUBLIC_*` variable or client component. Apply the Supabase migration and seed before switching either project from demo fallback to production data.
