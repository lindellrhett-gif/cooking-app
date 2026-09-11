# Pantry to Plate

An app that knows what food you have and tells you what you can cook with it.

Scan a grocery receipt, and the things you bought land in a shared pantry. Open
the app, and you get a list of dishes you can make right now, plus a second list
of dishes you are one or two items short of. Pick one and you get the full
recipe with calories and macros. Everyone in a household sees the same pantry
and the same shopping list, updating live.

Runs on iOS, Android, and the browser from one codebase.

---

## What is here

| Path | What it does |
|---|---|
| `app/` | Screens, routed by file with Expo Router |
| `components/` | Shared UI: buttons, cards, the ingredient picker, the recipe card |
| `lib/` | Supabase client, session, query hooks, realtime, receipt upload |
| `supabase/migrations/` | Schema, row-level security, and the matching engine |
| `supabase/seed/` | The curated ingredient dictionary and recipe library |
| `supabase/functions/parse-receipt/` | Reads receipt photos with Claude |
| `scripts/seed.mjs` | Validates and loads the seed data |

---

## Setup

You need two accounts. Both are free to start.

### 1. Supabase

Create a project at [supabase.com](https://supabase.com). From Project Settings,
API, copy the project URL and the `anon` key.

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

The anon key is designed to be public and is safe inside the app bundle. Row-level
security is what protects the data, not the secrecy of that key.

Then apply the migrations. Either link the Supabase CLI and push:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor in order,
`0001` through `0005`.

### 2. Seed the recipe library

Add your service role key to `.env` as `SUPABASE_SERVICE_ROLE_KEY`. It is used
only by this script, on your machine. The reference tables have no write
policies at all, so only the service role can populate them.

```bash
node --env-file=.env scripts/seed.mjs
```

To check the JSON without touching the database:

```bash
npm run seed -- --check
```

### 3. Anthropic, for receipt scanning

Get a key from [console.anthropic.com](https://console.anthropic.com), then set
it as an Edge Function secret and deploy the function:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key
npx supabase functions deploy parse-receipt
```

This key never goes in `.env` and never reaches the app. That is the entire
reason the Edge Function exists: anything bundled into an Expo build can be
read by anyone who installs it.

Everything except receipt scanning works without this step.

### 4. Run it

```bash
npx expo start
```

Press `w` for the browser, or scan the QR code with Expo Go on your phone.

---

## How the matching works

`match_recipes` in `supabase/migrations/0002_matching.sql` is the core of the
app. It joins recipe ingredients against your pantry and returns, per recipe,
how many required ingredients you have and which ones you are missing.

Three decisions shape what you see.

**Staples count as present.** Recipes need salt, oil, pepper and a spice rack.
If those counted as missing, almost nothing would ever match and the app would
look broken on first run. Ingredients flagged as staples are assumed to be in
stock. Settings, Staples is where a household says it has actually run out of
one.

**Matching asks whether an ingredient is present, not whether there is enough.**
Comparing "2 cups flour" against "1 bag flour" needs unit conversion across
volume, weight and count plus a density table per ingredient. That is its own
project and it fails in embarrassing ways. Quantities are tracked and displayed,
but they do not affect matching.

**Optional ingredients never block a match.** A garnish is not a blocker.

On top of that: recipes containing an allergen are hidden completely, diets must
all be satisfied, disliked ingredients push a recipe down, favourites push it up,
and anything cooked in the last two weeks sinks.

---

## How receipt scanning works

1. The app photographs the receipt and downscales it to 1600px before upload. A
   raw phone photo is several megabytes and no more legible.
2. It uploads to a private storage bucket at `{household_id}/{scan_id}.jpg`, which
   is the path shape the bucket policies gate on.
3. The `parse-receipt` Edge Function verifies the caller, downloads the image,
   and sends it to Claude with the full ingredient dictionary in the system
   prompt so the model maps directly to known slugs.
4. Claude returns validated JSON through structured outputs, one entry per line
   with a confidence rating.
5. The review screen shows every line. Unmatched and low-confidence rows sort to
   the top. You can edit, reassign or drop any of them.
6. Only on Confirm does anything reach the pantry. Items that were on the
   shopping list get ticked off automatically.

The dictionary block is marked for prompt caching and ordered by slug so its
bytes are identical every time. The function returns `cache_read_input_tokens`
in its response: on the second and later scans that should be non-zero. A zero
means the prefix changed and every scan is re-paying for the whole dictionary.

The review step is not a formality. Receipt abbreviations are genuinely
ambiguous, and a wrong guess that slips into the pantry makes the app suggest
meals from food you do not own, with nothing to explain why.

---

## Households

A household owns a pantry, a shopping list, and a receipt history. Creating one
gives you a six-character invite code, in an alphabet with no I, O, 0 or 1
because these get read aloud across a kitchen.

Preferences are deliberately per-person, not per-household. Two people share a
kitchen but not a diet.

Creating and joining go through security-definer functions rather than direct
inserts, because joining means reading a household you are not yet a member of.
Exposing that through a policy would let anyone enumerate households.

Every household-scoped table routes its policy through `is_household_member`.
That function must be `SECURITY DEFINER`: a policy on `household_members` that
itself queries `household_members` recurses infinitely and fails at runtime.

---

## Verifying it works

**Isolation.** Sign up two users into different households. Confirm each sees
only their own pantry, and that querying the other household's rows returns
empty rather than erroring.

**Matching.** Add a known set of pantry items and check that a specific recipe
shows under Ready to cook and a near-miss shows under Almost there with the
right missing items. Confirm staples do not block matches, and that setting an
allergen hides its recipes entirely.

**Receipt parsing.** Test the function directly before trusting the UI:

```bash
npx supabase functions invoke parse-receipt --body '{"scanId":"YOUR_SCAN_ID"}'
```

Try three photos: a clean receipt, a crumpled or angled one, and something that
is not a receipt at all. The third must come back empty rather than inventing
items.

**Household sync.** Open the web build in two browser windows signed in as two
members of one household. Add a pantry item in one and confirm it appears in the
other without a refresh. Delete one and confirm it disappears, which is what
migration `0005` is for.

---

## Known limits

These are deliberate, not defects.

- **Presence-based matching.** The app knows you have flour. It does not know
  whether you have enough flour.
- **Macros are authored estimates.** Written per serving from standard
  references, not computed from ingredient weights or lab verified. Good enough
  to guide a decision, not a clinical tool.
- **Receipt parsing is imperfect.** Some receipts are genuinely unreadable. The
  review screen is the mitigation and it is not optional.
- **One active household per user.** The membership table permits more; the
  interface assumes one.
- **Light theme only.** Pinned in `app.json` rather than shipping a
  half-finished dark mode.

---

## Adding recipes

Edit `supabase/seed/recipes.json`, then:

```bash
npm run seed -- --check
```

The validator refuses unknown ingredient slugs, duplicate slugs, ingredients
listed twice in one recipe, aliases claimed by two ingredients, and recipes
where every ingredient is optional. A recipe pointing at an ingredient that does
not exist would otherwise be silently unmatchable, appearing in no results with
nothing to explain why.

New ingredients go in `supabase/seed/ingredients.json`. Give each one the
aliases a receipt might print, since that list is what the receipt parser
matches against.
