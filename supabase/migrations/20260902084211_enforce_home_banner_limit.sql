-- API의 사전 count만으로는 두 관리자가 동시에 올릴 때 12장 제한을 넘을 수 있다.
-- 트랜잭션 advisory lock으로 배너 INSERT를 직렬화하고 DB가 최종 한도를 보장한다.
create or replace function private.enforce_home_banner_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(20260902084211);
  if (select count(*) from public.home_banners) >= 12 then
    raise exception using
      errcode = '23514',
      message = 'home_banners supports at most 12 rows';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_home_banner_limit() from public;

drop trigger if exists enforce_home_banner_limit_before_insert on public.home_banners;
create trigger enforce_home_banner_limit_before_insert
before insert on public.home_banners
for each row execute function private.enforce_home_banner_limit();
