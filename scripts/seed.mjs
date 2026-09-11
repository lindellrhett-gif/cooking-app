#!/usr/bin/env node
//
// Loads the curated ingredient dictionary and recipe library into Supabase.
//
//   node scripts/seed.mjs --check    validate the JSON only, no database needed
//   node scripts/seed.mjs            validate, then write
//
// Writing needs SUPABASE_SERVICE_ROLE_KEY. Reference tables have no write
// policies at all, so only the service role can populate them. That key must
// never reach the app.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '..', 'supabase', 'seed');

const read = (name) => JSON.parse(readFileSync(join(seedDir, name), 'utf8'));

const ingredients = read('ingredients.json');
const recipes = read('recipes.json');

// ---------------------------------------------------------------------------
// Validation. This runs before any write, because a recipe pointing at an
// ingredient that does not exist is silently unmatchable: it would simply
// never appear in results, with nothing to explain why.
// ---------------------------------------------------------------------------

const problems = [];
const seenIngredientSlugs = new Set();
const seenAliases = new Map();

for (const [i, ing] of ingredients.entries()) {
  const where = `ingredients[${i}] (${ing.slug ?? 'no slug'})`;
  for (const field of ['slug', 'name', 'category', 'unit']) {
    if (!ing[field]) problems.push(`${where}: missing "${field}"`);
  }
  if (seenIngredientSlugs.has(ing.slug)) problems.push(`${where}: duplicate slug`);
  seenIngredientSlugs.add(ing.slug);

  for (const alias of ing.aliases ?? []) {
    const key = alias.toLowerCase().trim();
    // A duplicated alias makes receipt matching ambiguous: two ingredients
    // would both claim the same receipt line.
    if (seenAliases.has(key) && seenAliases.get(key) !== ing.slug) {
      problems.push(`${where}: alias "${alias}" already belongs to ${seenAliases.get(key)}`);
    }
    seenAliases.set(key, ing.slug);
  }
}

const seenRecipeSlugs = new Set();

for (const [i, r] of recipes.entries()) {
  const where = `recipes[${i}] (${r.slug ?? 'no slug'})`;
  for (const field of ['slug', 'title', 'servings', 'calories', 'ingredients', 'steps']) {
    if (r[field] === undefined || r[field] === null) problems.push(`${where}: missing "${field}"`);
  }
  if (seenRecipeSlugs.has(r.slug)) problems.push(`${where}: duplicate slug`);
  seenRecipeSlugs.add(r.slug);

  if (!Array.isArray(r.steps) || r.steps.length === 0) {
    problems.push(`${where}: needs at least one step`);
  }

  const seenInRecipe = new Set();
  let requiredCount = 0;

  for (const ri of r.ingredients ?? []) {
    if (!seenIngredientSlugs.has(ri.slug)) {
      problems.push(`${where}: unknown ingredient slug "${ri.slug}"`);
    }
    // recipe_ingredients is unique on (recipe_id, ingredient_id), so a repeat
    // here fails the insert rather than quietly doing something odd.
    if (seenInRecipe.has(ri.slug)) {
      problems.push(`${where}: ingredient "${ri.slug}" listed twice`);
    }
    seenInRecipe.add(ri.slug);
    if (!ri.optional) requiredCount += 1;
  }

  if (requiredCount === 0) {
    problems.push(`${where}: every ingredient is optional, so it would match an empty pantry`);
  }

  for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
    if (typeof r[key] !== 'number') problems.push(`${where}: "${key}" must be a number`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) found:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

// A recipe nobody can ever cook is worth knowing about, so report the shape of
// the library rather than just declaring success.
const staples = ingredients.filter((i) => i.staple).length;
const byMeal = {};
for (const r of recipes) {
  for (const m of r.meal_types ?? ['unspecified']) byMeal[m] = (byMeal[m] ?? 0) + 1;
}

console.log(`Validated ${ingredients.length} ingredients (${staples} staples) and ${recipes.length} recipes.`);
console.log(`Meal coverage: ${Object.entries(byMeal).map(([k, v]) => `${k} ${v}`).join(', ')}`);

if (process.argv.includes('--check')) {
  console.log('Check only, nothing written.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\nSet EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to write.');
  console.error('With a .env file present, run:  node --env-file=.env scripts/seed.mjs\n');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(url, key, { auth: { persistSession: false } });

const fail = (label, error) => {
  if (!error) return;
  console.error(`\n${label} failed: ${error.message}`);
  process.exit(1);
};

console.log('\nWriting ingredients...');
const { error: ingErr } = await db.from('ingredients').upsert(
  ingredients.map((i) => ({
    slug: i.slug,
    display_name: i.name,
    category: i.category,
    default_unit: i.unit,
    aliases: i.aliases ?? [],
    is_staple: !!i.staple,
  })),
  { onConflict: 'slug' },
);
fail('ingredient upsert', ingErr);

const { data: ingRows, error: ingReadErr } = await db.from('ingredients').select('id, slug');
fail('ingredient read-back', ingReadErr);
const idBySlug = new Map(ingRows.map((r) => [r.slug, r.id]));

console.log('Writing recipes...');
const { error: recErr } = await db.from('recipes').upsert(
  recipes.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description ?? '',
    meal_types: r.meal_types ?? [],
    cuisine: r.cuisine ?? null,
    prep_minutes: r.prep_minutes ?? 0,
    cook_minutes: r.cook_minutes ?? 0,
    servings: r.servings,
    instructions: r.steps,
    calories: r.calories,
    protein_g: r.protein_g,
    carbs_g: r.carbs_g,
    fat_g: r.fat_g,
    fiber_g: r.fiber_g ?? 0,
    tags: r.tags ?? [],
    diet_flags: r.diet_flags ?? [],
  })),
  { onConflict: 'slug' },
);
fail('recipe upsert', recErr);

const { data: recRows, error: recReadErr } = await db.from('recipes').select('id, slug');
fail('recipe read-back', recReadErr);
const recipeIdBySlug = new Map(recRows.map((r) => [r.slug, r.id]));

console.log('Writing recipe ingredients...');
const links = [];
for (const r of recipes) {
  const recipeId = recipeIdBySlug.get(r.slug);
  r.ingredients.forEach((ri, order) => {
    links.push({
      recipe_id: recipeId,
      ingredient_id: idBySlug.get(ri.slug),
      quantity: ri.qty ?? null,
      unit: ri.unit ?? null,
      is_optional: !!ri.optional,
      prep_note: ri.note ?? null,
      sort_order: order,
    });
  });
}

// Replace rather than merge, so removing an ingredient from the JSON actually
// removes it from the database on the next run.
const { error: clearErr } = await db
  .from('recipe_ingredients')
  .delete()
  .in('recipe_id', [...recipeIdBySlug.values()]);
fail('clearing old recipe ingredients', clearErr);

for (let i = 0; i < links.length; i += 500) {
  const { error } = await db.from('recipe_ingredients').insert(links.slice(i, i + 500));
  fail(`recipe ingredient insert (batch at ${i})`, error);
}

console.log(`\nDone. ${ingredients.length} ingredients, ${recipes.length} recipes, ${links.length} recipe ingredients.`);
