drop policy if exists store_settings_admin_write on public.store_settings;

create policy store_settings_admin_insert
  on public.store_settings
  for insert
  to authenticated
  with check (private.is_operator_or_admin());

create policy store_settings_admin_update
  on public.store_settings
  for update
  to authenticated
  using (private.is_operator_or_admin())
  with check (private.is_operator_or_admin());

create policy store_settings_admin_delete
  on public.store_settings
  for delete
  to authenticated
  using (private.is_operator_or_admin());
