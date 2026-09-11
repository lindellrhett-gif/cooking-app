-- The matching engine.
--
-- Runs in the database rather than on the device so that ranking one hundred
-- recipes against a pantry is a single round trip instead of a full download.
--
-- Three decisions shape the results:
--
--   1. Staples count as present. A recipe needing salt, oil and water would
--      otherwise never match, and the app would look broken on first run.
--      Households opt out per staple when they actually run out.
--
--   2. Matching asks whether an ingredient is present, not whether there is
--      enough of it. Comparing "2 cups flour" against "1 bag flour" needs unit
--      conversion across volume, weight and count plus per-ingredient density.
--      That is its own project and it fails in embarrassing ways.
--
--   3. Optional ingredients never block a match. A garnish is not a blocker.

-- What counts as being in the pantry. Defined once, because the staple rule
-- has to be identical everywhere it is asked or the two answers drift apart.
create or replace function public.effective_pantry(p_household_id uuid)
returns table (ingredient_id uuid)
language sql
stable
security invoker
set search_path = public
as $fn$
  select pi.ingredient_id
  from pantry_items pi
  where pi.household_id = p_household_id
  union
  select i.id
  from ingredients i
  where i.is_staple
    and not exists (
      select 1 from household_staple_optouts o
      where o.household_id = p_household_id and o.ingredient_id = i.id
    );
$fn$;

revoke all on function public.effective_pantry(uuid) from public;
grant execute on function public.effective_pantry(uuid) to authenticated;

create or replace function public.match_recipes(
  p_household_id uuid,
  p_max_missing  int default 2
)
returns table (
  recipe_id              uuid,
  slug                   text,
  title                  text,
  description            text,
  meal_types             text[],
  cuisine                text,
  prep_minutes           int,
  cook_minutes           int,
  servings               int,
  calories               int,
  protein_g              numeric,
  carbs_g                numeric,
  fat_g                  numeric,
  fiber_g                numeric,
  tags                   text[],
  diet_flags             text[],
  required_count         int,
  have_count             int,
  missing_count          int,
  missing_ingredient_ids uuid[],
  missing_ingredient_names text[],
  is_favorite            boolean,
  last_cooked_at         timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $fn$
begin
  -- Belt and braces. RLS already hides other households' pantry rows, so a
  -- caller passing someone else's id would see only staples, but failing
  -- loudly beats returning a plausible-looking wrong answer.
  if not public.is_household_member(p_household_id) then
    raise exception 'You are not a member of that household.';
  end if;

  return query
  with effective_pantry as (
    select ep.ingredient_id from public.effective_pantry(p_household_id) ep
  ),
  -- Always exactly one row, even for a user with no preferences saved.
  prefs as (
    select
      coalesce(up.allergen_ingredient_ids, '{}'::uuid[]) as allergens,
      coalesce(up.disliked_ingredient_ids, '{}'::uuid[]) as dislikes,
      coalesce(up.diets, '{}'::text[])                   as diets,
      coalesce(up.preferred_meal_types, '{}'::text[])    as pref_meals,
      up.max_cook_minutes
    from (select 1) placeholder
    left join user_preferences up on up.user_id = auth.uid()
  ),
  stats as (
    select
      ri.recipe_id as rid,
      count(*) filter (where not ri.is_optional)::int as req,
      count(*) filter (where not ri.is_optional and ep.ingredient_id is not null)::int as have,
      array_remove(
        array_agg(ri.ingredient_id order by ri.sort_order)
          filter (where not ri.is_optional and ep.ingredient_id is null),
        null
      ) as missing_ids,
      array_remove(
        array_agg(ing.display_name order by ri.sort_order)
          filter (where not ri.is_optional and ep.ingredient_id is null),
        null
      ) as missing_names,
      -- An allergen anywhere in the recipe disqualifies it, optional or not.
      bool_or(ri.ingredient_id = any(pr.allergens)) as has_allergen,
      bool_or(ri.ingredient_id = any(pr.dislikes) and not ri.is_optional) as has_dislike
    from recipe_ingredients ri
    join ingredients ing on ing.id = ri.ingredient_id
    left join effective_pantry ep on ep.ingredient_id = ri.ingredient_id
    cross join prefs pr
    group by ri.recipe_id
  ),
  recent as (
    select cl.recipe_id as rid, max(cl.cooked_at) as last_cooked
    from cooked_log cl
    where cl.household_id = p_household_id
    group by cl.recipe_id
  )
  select
    r.id,
    r.slug,
    r.title,
    r.description,
    r.meal_types,
    r.cuisine,
    r.prep_minutes,
    r.cook_minutes,
    r.servings,
    r.calories,
    r.protein_g,
    r.carbs_g,
    r.fat_g,
    r.fiber_g,
    r.tags,
    r.diet_flags,
    s.req,
    s.have,
    (s.req - s.have)::int,
    coalesce(s.missing_ids, '{}'::uuid[]),
    coalesce(s.missing_names, '{}'::text[]),
    (f.recipe_id is not null),
    rc.last_cooked
  from recipes r
  join stats s on s.rid = r.id
  cross join prefs pr
  left join favorites f on f.recipe_id = r.id and f.user_id = auth.uid()
  left join recent rc on rc.rid = r.id
  where
        not coalesce(s.has_allergen, false)
    and (s.req - s.have) <= p_max_missing
    -- Every diet the user asked for must be satisfied, not just one of them.
    and (cardinality(pr.diets) = 0 or r.diet_flags @> pr.diets)
    and (pr.max_cook_minutes is null or (r.prep_minutes + r.cook_minutes) <= pr.max_cook_minutes)
  order by
    (s.req - s.have) asc,                                  -- cookable now first
    (f.recipe_id is not null) desc,                        -- then favorites
    coalesce(s.has_dislike, false) asc,                    -- then things you like
    (rc.last_cooked is not null
       and rc.last_cooked > now() - interval '14 days') asc, -- not last Tuesday's dinner
    (r.prep_minutes + r.cook_minutes) asc,                 -- then quickest
    r.title asc;
end;
$fn$;

revoke all on function public.match_recipes(uuid, int) from public;
grant execute on function public.match_recipes(uuid, int) to authenticated;


-- Autocomplete for manual pantry entry and for fixing unmatched receipt lines.
-- Searches display names and the alias list, because a user typing "scallion"
-- should find the row whose canonical name is "green onion".
create or replace function public.search_ingredients(
  p_query text,
  p_limit int default 25
)
returns setof ingredients
language sql
stable
security invoker
set search_path = public
as $fn$
  select i.*
  from ingredients i
  where
    p_query is null or trim(p_query) = ''
    or i.display_name ilike '%' || trim(p_query) || '%'
    or exists (
      select 1 from unnest(i.aliases) a
      where a ilike '%' || trim(p_query) || '%'
    )
  order by
    -- Prefix matches before mid-word matches before alias-only matches.
    case
      when i.display_name ilike trim(p_query) || '%' then 0
      when i.display_name ilike '%' || trim(p_query) || '%' then 1
      else 2
    end,
    i.display_name
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$fn$;

revoke all on function public.search_ingredients(text, int) from public;
grant execute on function public.search_ingredients(text, int) to authenticated;
