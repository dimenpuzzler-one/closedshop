-- 사진의 용도를 저장한다.
--
-- 등록 화면에는 "썸네일"과 "상세페이지 이미지" 칸이 따로 있었는데, 업로드 직전에
-- 두 목록을 합쳐 구분 없이 올리고 있었다. 그래서 어느 것이 대표 사진인지 알 방법이
-- 없어 화면에서는 순서(첫 장)나 이미지 비율로 추측해야 했다. 운영자가 이미 정한 값을
-- 버리고 다시 알아맞히는 구조였다.

alter table public.product_images
  add column if not exists role text not null default 'detail';

alter table public.product_images drop constraint if exists product_images_role_check;
alter table public.product_images
  add constraint product_images_role_check check (role in ('thumbnail', 'detail'));

create index if not exists product_images_role_idx on public.product_images (product_id, role, sort_order);

comment on column public.product_images.role is
  'thumbnail=목록 썸네일과 상세 상단 대표 사진, detail=상세페이지 본문에 세로로 쌓이는 이미지';

-- 기존 사진 백필. 지금 화면이 동작하는 방식(세로가 가로의 3배 미만이면 대표 사진)을
-- 그대로 옮긴다. 크기를 모르는 옛 사진은 대표로 본다 -- 상세로 잘못 넣으면 대표 사진이
-- 아예 사라지지만, 대표로 잘못 넣으면 목록에 조금 이상하게 보일 뿐이다.
update public.product_images
   set role = case
     when width is null or height is null or width = 0 then 'thumbnail'
     when height::numeric / width >= 3 then 'detail'
     else 'thumbnail'
   end;
