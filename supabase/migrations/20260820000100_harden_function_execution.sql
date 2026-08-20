-- Keep function object lookup deterministic and remove direct Data API access
-- to the dashboard-created automatic-RLS trigger function. The trigger itself
-- continues to run under its owning role.
alter function public.reserve_inventory(uuid, integer) set search_path = public;
alter function public.release_inventory(uuid, integer) set search_path = public;
alter function public.redeem_promotion_code(uuid, uuid, uuid, integer) set search_path = public;

alter function public.rls_auto_enable() set search_path = pg_catalog, public;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
