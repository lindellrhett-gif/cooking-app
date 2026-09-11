-- Multi-step writes that need to be atomic, or that would otherwise be a
-- chatty sequence of round trips from a phone on a slow connection.

-- "Add what I'm missing to the shopping list", from a recipe detail screen.
--
-- Deliberately does not reuse match_recipes: that function filters by the
-- viewer's allergens and diets, and a user looking at a recipe has already
-- decided they want it. Asking about one recipe should not be answered
-- through a filter designed for browsing.
create or replace function public.add_recipe_missing_to_list(
  p_household_id uuid,
  p_recipe_id    uuid
)
returns int
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_added int;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of that household.';
  end if;

  insert into shopping_list_items (household_id, ingredient_id, quantity, unit, added_by, from_recipe_id)
  select
    p_household_id,
    ri.ingredient_id,
    ri.quantity,
    ri.unit,
    auth.uid(),
    p_recipe_id
  from recipe_ingredients ri
  where ri.recipe_id = p_recipe_id
    and not ri.is_optional
    and ri.ingredient_id not in (
      select ep.ingredient_id from public.effective_pantry(p_household_id) ep
    )
  -- Already on the list unchecked? Leave the existing row alone.
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$fn$;

revoke all on function public.add_recipe_missing_to_list(uuid, uuid) from public;
grant execute on function public.add_recipe_missing_to_list(uuid, uuid) to authenticated;


-- Commit a reviewed receipt to the pantry.
--
-- Called only from the review screen, never straight from the parser. Takes
-- the items the user confirmed, not the items the model returned.
--
-- p_items is a JSON array of { ingredient_id, quantity, unit }.
create or replace function public.apply_receipt_items(
  p_household_id uuid,
  p_scan_id      uuid,
  p_items        jsonb
)
returns int
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_applied int;
  v_ids     uuid[];
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of that household.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Expected an array of items.';
  end if;

  select array_agg((item ->> 'ingredient_id')::uuid)
  into v_ids
  from jsonb_array_elements(p_items) item
  where item ->> 'ingredient_id' is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  insert into pantry_items (household_id, ingredient_id, quantity, unit, source, added_by)
  select
    p_household_id,
    (item ->> 'ingredient_id')::uuid,
    nullif(item ->> 'quantity', '')::numeric,
    nullif(item ->> 'unit', ''),
    'receipt',
    auth.uid()
  from jsonb_array_elements(p_items) item
  where item ->> 'ingredient_id' is not null
  on conflict (household_id, ingredient_id) do update
    set
      -- Adding two litres to two bags is meaningless, so only sum when the
      -- units agree. Otherwise the newer figure simply wins.
      quantity = case
        when pantry_items.unit is not distinct from excluded.unit
          then coalesce(pantry_items.quantity, 0) + coalesce(excluded.quantity, 0)
        else excluded.quantity
      end,
      unit     = coalesce(excluded.unit, pantry_items.unit),
      source   = 'receipt',
      added_by = excluded.added_by,
      added_at = now();

  get diagnostics v_applied = row_count;

  -- You just bought it, so tick it off the list.
  update shopping_list_items
  set is_checked = true
  where household_id = p_household_id
    and is_checked = false
    and ingredient_id = any(v_ids);

  -- Buying a staple means you are no longer out of it.
  delete from household_staple_optouts
  where household_id = p_household_id
    and ingredient_id = any(v_ids);

  update receipt_scans
  set status = 'applied'
  where id = p_scan_id and household_id = p_household_id;

  return v_applied;
end;
$fn$;

revoke all on function public.apply_receipt_items(uuid, uuid, jsonb) from public;
grant execute on function public.apply_receipt_items(uuid, uuid, jsonb) to authenticated;


-- Record a cooked meal. The pantry is not touched here: the user chooses what
-- to remove afterwards, because the app cannot know whether the recipe used up
-- the last of the rice or a cupful of it.
create or replace function public.log_cooked(
  p_household_id uuid,
  p_recipe_id    uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of that household.';
  end if;

  insert into cooked_log (household_id, recipe_id, cooked_by)
  values (p_household_id, p_recipe_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.log_cooked(uuid, uuid) from public;
grant execute on function public.log_cooked(uuid, uuid) to authenticated;


-- Everything a recipe detail screen needs in one call: each ingredient, and
-- whether the household has it.
create or replace function public.recipe_with_availability(
  p_household_id uuid,
  p_recipe_id    uuid
)
returns table (
  ingredient_id uuid,
  display_name  text,
  category      text,
  quantity      numeric,
  unit          text,
  is_optional   boolean,
  prep_note     text,
  sort_order    int,
  in_pantry     boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $fn$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of that household.';
  end if;

  return query
  select
    ri.ingredient_id,
    i.display_name,
    i.category,
    ri.quantity,
    ri.unit,
    ri.is_optional,
    ri.prep_note,
    ri.sort_order,
    (ep.ingredient_id is not null)
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  left join public.effective_pantry(p_household_id) ep
    on ep.ingredient_id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id
  order by ri.sort_order, i.display_name;
end;
$fn$;

revoke all on function public.recipe_with_availability(uuid, uuid) from public;
grant execute on function public.recipe_with_availability(uuid, uuid) to authenticated;
