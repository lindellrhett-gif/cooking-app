-- A receipt often lists the same ingredient on two lines: two cartons of milk,
-- or a loose onion and a bag of onions. apply_receipt_items inserted every line
-- in one statement, and Postgres refuses an ON CONFLICT DO UPDATE that touches
-- the same row twice, so the whole receipt failed with:
--
--   ON CONFLICT DO UPDATE command cannot affect row a second time
--
-- Lines are now merged per ingredient before the insert, using the same rule
-- the conflict clause applies against the existing pantry row: sum when the
-- units agree, otherwise the later line wins.
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

  select array_agg(distinct (item ->> 'ingredient_id')::uuid)
  into v_ids
  from jsonb_array_elements(p_items) item
  where item ->> 'ingredient_id' is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  with lines as (
    select
      (item ->> 'ingredient_id')::uuid        as ingredient_id,
      nullif(item ->> 'quantity', '')::numeric as quantity,
      nullif(item ->> 'unit', '')              as unit,
      ord
    from jsonb_array_elements(p_items) with ordinality as t(item, ord)
    where item ->> 'ingredient_id' is not null
  ),
  merged as (
    select
      ingredient_id,
      case
        when count(distinct coalesce(unit, '')) = 1 then sum(quantity)
        else (array_agg(quantity order by ord desc))[1]
      end as quantity,
      case
        when count(distinct coalesce(unit, '')) = 1 then max(unit)
        else (array_agg(unit order by ord desc))[1]
      end as unit
    from lines
    group by ingredient_id
  )
  insert into pantry_items (household_id, ingredient_id, quantity, unit, source, added_by)
  select p_household_id, ingredient_id, quantity, unit, 'receipt', auth.uid()
  from merged
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
