create index if not exists product_images_product_sort_idx
  on public.product_images (product_id, sort_order);

create index if not exists product_options_product_idx
  on public.product_options (product_id);
