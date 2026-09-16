alter table public.category_rules
  drop constraint if exists category_rules_field_check;

alter table public.category_rules
  add constraint category_rules_field_check
  check (field in ('all', 'merchant', 'description', 'bank', 'amount'));
