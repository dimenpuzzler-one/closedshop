-- The original migration revoked PUBLIC, but this project's legacy default
-- privileges had also granted EXECUTE directly to anon and authenticated.
-- Only trusted server code and pg_cron may expire pending orders.
revoke all on function public.expire_stale_pending_orders(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_pending_orders(integer)
  to service_role;
