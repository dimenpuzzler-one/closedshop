drop policy if exists "home_banners_admin_write" on public.home_banners;

create policy "home_banners_admin_insert"
on public.home_banners
for insert
to authenticated
with check (private.is_operator_or_admin());

create policy "home_banners_admin_update"
on public.home_banners
for update
to authenticated
using (private.is_operator_or_admin())
with check (private.is_operator_or_admin());

create policy "home_banners_admin_delete"
on public.home_banners
for delete
to authenticated
using (private.is_operator_or_admin());
