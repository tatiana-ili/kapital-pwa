alter table public.category_rules
  add column if not exists direction public.category_direction not null default 'both';

-- Transactions and rules store category names, so a custom name must be unique
-- across directions and must not shadow a system category.
create or replace function public.validate_user_category()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  if new.is_system then
    raise exception 'A personal category cannot be marked as system';
  end if;
  new.name := regexp_replace(btrim(new.name), '[[:space:]]+', ' ', 'g');
  if length(new.name) < 1 or length(new.name) > 80 then
    raise exception 'Category name must contain 1 to 80 characters';
  end if;
  if exists (
    select 1 from public.categories existing
    where (existing.user_id is null or existing.user_id = new.user_id)
      and lower(existing.name) = lower(new.name)
      and existing.id <> new.id
  ) then
    raise exception 'A category with this name already exists';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_validate_before_write on public.categories;
create trigger categories_validate_before_write
before insert or update of name, direction, user_id, is_system on public.categories
for each row execute function public.validate_user_category();

create or replace function public.rename_user_category(
  p_category_id uuid,
  p_new_name text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  old_name text;
  next_name text := regexp_replace(btrim(p_new_name), '[[:space:]]+', ' ', 'g');
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if next_name is null or length(next_name) < 1 or length(next_name) > 80 then
    raise exception 'Category name must contain 1 to 80 characters';
  end if;

  select name into old_name
  from public.categories
  where id = p_category_id
    and user_id = current_user_id
    and not is_system
  for update;
  if old_name is null then
    raise exception 'Category not found or cannot be renamed';
  end if;

  update public.categories
  set name = next_name
  where id = p_category_id;

  update public.transactions
  set category = next_name
  where user_id = current_user_id and category = old_name;

  update public.category_rules
  set target_category = next_name
  where user_id = current_user_id and target_category = old_name;

  update public.budgets
  set category = next_name
  where user_id = current_user_id and category = old_name;
end;
$$;

revoke all on function public.rename_user_category(uuid, text) from public;
grant execute on function public.rename_user_category(uuid, text) to authenticated;
