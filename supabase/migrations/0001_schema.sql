-- Pantry-to-Plate: core schema
-- Three zones: global reference data, household-scoped data, user-scoped data.

create extension if not exists pgcrypto;

create type pantry_source   as enum ('manual', 'receipt');
create type scan_status     as enum ('pending', 'parsed', 'failed', 'applied');
create type household_role  as enum ('owner', 'member');

-- =====================================================================
-- Reference data. Readable by any signed-in user, writable by no one.
-- Seeded through the service role, which bypasses RLS.
-- =====================================================================

create table ingredients (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  category      text not null,
  default_unit  text not null default 'unit',
  -- What a receipt might call this. GV MLK 2% has to resolve to milk somehow.
  aliases       text[] not null default '{}',
  -- Salt, oil, water. Assumed on hand unless a household says otherwise.
  is_staple     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index ingredients_aliases_idx  on ingredients using gin (aliases);
create index ingredients_category_idx on ingredients (category);

create table recipes (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  description   text not null default '',
  meal_types    text[] not null default '{}',
  cuisine       text,
  prep_minutes  int not null default 0,
  cook_minutes  int not null default 0,
  servings      int not null default 2,
  instructions  jsonb not null default '[]'::jsonb,
  -- Macros are per serving, hand-authored. See README on their accuracy.
  calories      int not null,
  protein_g     numeric(6,1) not null,
  carbs_g       numeric(6,1) not null,
  fat_g         numeric(6,1) not null,
  fiber_g       numeric(6,1) not null default 0,
  tags          text[] not null default '{}',
  diet_flags    text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index recipes_meal_types_idx on recipes using gin (meal_types);
create index recipes_diet_flags_idx on recipes using gin (diet_flags);

-- The join table that makes matching possible. Recipes cannot be free text.
create table recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity      numeric(8,2),
  unit          text,
  is_optional   boolean not null default false,
  prep_note     text,
  sort_order    int not null default 0,
  unique (recipe_id, ingredient_id)
);
create index recipe_ingredients_ingredient_idx on recipe_ingredients (ingredient_id);

-- =====================================================================
-- Households
-- =====================================================================

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text unique not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         household_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on household_members (user_id);

-- =====================================================================
-- User-scoped. Preferences are per-person on purpose: a household shares
-- a pantry, not a diet.
-- =====================================================================

create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null default '',
  active_household_id uuid references households(id) on delete set null,
  created_at          timestamptz not null default now()
);

create table user_preferences (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  diets                   text[] not null default '{}',
  allergen_ingredient_ids uuid[] not null default '{}',
  disliked_ingredient_ids uuid[] not null default '{}',
  preferred_meal_types    text[] not null default '{}',
  max_cook_minutes        int,
  calorie_target          int,
  macro_targets           jsonb not null default '{}'::jsonb,
  updated_at              timestamptz not null default now()
);

create table favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- =====================================================================
-- Household-scoped data
-- =====================================================================

-- One row per ingredient per household. Do we have milk is one question,
-- so buying milk twice increments a quantity rather than adding a row.
create table pantry_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity      numeric(8,2),
  unit          text,
  source        pantry_source not null default 'manual',
  added_by      uuid references auth.users(id) on delete set null,
  added_at      timestamptz not null default now(),
  expires_on    date,
  unique (household_id, ingredient_id)
);
create index pantry_items_household_idx on pantry_items (household_id);

-- Staples are treated as in stock by default. This table is the opt-out:
-- we are actually out of olive oil.
create table household_staple_optouts (
  household_id  uuid not null references households(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  primary key (household_id, ingredient_id)
);

create table shopping_list_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  ingredient_id  uuid references ingredients(id) on delete cascade,
  free_text      text,
  quantity       numeric(8,2),
  unit           text,
  is_checked     boolean not null default false,
  added_by       uuid references auth.users(id) on delete set null,
  from_recipe_id uuid references recipes(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint shopping_item_has_subject check (ingredient_id is not null or free_text is not null)
);
create index shopping_list_household_idx on shopping_list_items (household_id);
-- Tapping add tomatoes twice should not produce two open rows.
create unique index shopping_list_open_ingredient_idx
  on shopping_list_items (household_id, ingredient_id)
  where ingredient_id is not null and is_checked = false;

-- Audit trail, so a failed parse can be retried without re-photographing.
create table receipt_scans (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  uploaded_by    uuid references auth.users(id) on delete set null,
  storage_path   text not null,
  status         scan_status not null default 'pending',
  parsed_payload jsonb,
  error          text,
  created_at     timestamptz not null default now()
);
create index receipt_scans_household_idx on receipt_scans (household_id, created_at desc);

create table cooked_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id    uuid not null references recipes(id) on delete cascade,
  cooked_by    uuid references auth.users(id) on delete set null,
  cooked_at    timestamptz not null default now()
);
create index cooked_log_household_idx on cooked_log (household_id, cooked_at desc);

-- =====================================================================
-- Membership helpers.
--
-- These must be SECURITY DEFINER. A policy on household_members that
-- itself selects from household_members recurses infinitely and fails at
-- runtime. Routing every membership check through a definer function that
-- bypasses RLS is what breaks the cycle.
-- =====================================================================

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$fn$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$fn$;

create or replace function public.shares_household_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = other_user
  );
$fn$;

-- =====================================================================
-- Row-level security
-- =====================================================================

alter table ingredients              enable row level security;
alter table recipes                  enable row level security;
alter table recipe_ingredients       enable row level security;
alter table households               enable row level security;
alter table household_members        enable row level security;
alter table profiles                 enable row level security;
alter table user_preferences         enable row level security;
alter table favorites                enable row level security;
alter table pantry_items             enable row level security;
alter table household_staple_optouts enable row level security;
alter table shopping_list_items      enable row level security;
alter table receipt_scans            enable row level security;
alter table cooked_log               enable row level security;

-- Reference data: read-only to everyone signed in. No write policies at all,
-- which means no client can write regardless of what it tries.
create policy ref_read_ingredients        on ingredients        for select to authenticated using (true);
create policy ref_read_recipes            on recipes            for select to authenticated using (true);
create policy ref_read_recipe_ingredients on recipe_ingredients for select to authenticated using (true);

-- Households. Creating and joining go through RPCs below, not direct inserts,
-- because joining requires reading a household you are not yet a member of.
create policy households_read on households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on households for update to authenticated
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy members_read on household_members for select to authenticated
  using (public.is_household_member(household_id));
-- Leave a household yourself, or be removed by an owner.
create policy members_delete on household_members for delete to authenticated
  using (user_id = auth.uid() or public.is_household_owner(household_id));

-- Profiles: yours, plus anyone you share a kitchen with (for the members list).
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or public.shares_household_with(id));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on profiles for insert to authenticated
  with check (id = auth.uid());

create policy prefs_all on user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy favorites_all on favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Household data: identical shape everywhere. If you are in the household,
-- you get full access; if not, rows simply do not exist for you.
create policy pantry_all on pantry_items for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy staple_optouts_all on household_staple_optouts for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy shopping_all on shopping_list_items for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy scans_all on receipt_scans for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy cooked_all on cooked_log for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- =====================================================================
-- Signup: give every new user a profile and a preferences row so the app
-- never has to cope with them being absent.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Household creation and joining.
--
-- Both are SECURITY DEFINER because each needs to touch rows the caller
-- cannot yet see: you must read a household by invite code before you are
-- a member of it. Exposing that through a policy would let anyone enumerate
-- households; exposing it through a function that only ever returns your
-- own new membership does not.
-- =====================================================================

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $fn$
declare
  -- No I, O, 0 or 1. These get read aloud across a kitchen.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from households where invite_code = code);
  end loop;
  return code;
end;
$fn$;

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into households (name, invite_code, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'My Kitchen'), public.generate_invite_code(), auth.uid())
  returning id into v_id;

  insert into household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  update profiles set active_household_id = v_id where id = auth.uid();

  return v_id;
end;
$fn$;

create or replace function public.join_household(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_id
  from households
  where invite_code = upper(trim(p_invite_code));

  if v_id is null then
    raise exception 'That invite code does not match any household.';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  update profiles set active_household_id = v_id where id = auth.uid();

  return v_id;
end;
$fn$;

revoke all on function public.create_household(text) from public;
revoke all on function public.join_household(text)   from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text)   to authenticated;
