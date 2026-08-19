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

The web project also needs these server-only variables for persisted order and webhook flows:

```text
SUPABASE_SERVICE_ROLE_KEY
PAYMENT_WEBHOOK_SECRET
L1_COMMISSION_RATE
L2_COMMISSION_RATE
COMMISSION_APPROVAL_DAYS
```

Never add `SUPABASE_SERVICE_ROLE_KEY` to a `NEXT_PUBLIC_*` variable or client component. Apply the Supabase migration and seed before switching either project from demo fallback to production data.
