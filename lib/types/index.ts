// Domain types.
//
// These are hand-written rather than generated so the project runs before a
// Supabase project exists. Once you have one, `npm run db:types` writes the
// full generated schema to lib/types/database.ts; these stay useful as the
// shapes the UI actually consumes, which are narrower than the raw tables.

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'side' | 'dessert';

export type DietFlag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'low-carb'
  | 'high-fiber';

export interface Ingredient {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  default_unit: string;
  aliases: string[];
  is_staple: boolean;
}

export interface PantryItem {
  id: string;
  household_id: string;
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
  source: 'manual' | 'receipt';
  added_by: string | null;
  added_at: string;
  expires_on: string | null;
  ingredient: Ingredient;
}

export interface ShoppingListItem {
  id: string;
  household_id: string;
  ingredient_id: string | null;
  free_text: string | null;
  quantity: number | null;
  unit: string | null;
  is_checked: boolean;
  added_by: string | null;
  from_recipe_id: string | null;
  created_at: string;
  ingredient: Ingredient | null;
}

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  description: string;
  meal_types: MealType[];
  cuisine: string | null;
  prep_minutes: number;
  cook_minutes: number;
  servings: number;
  instructions: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  tags: string[];
  diet_flags: DietFlag[];
}

/** One row from the match_recipes RPC. */
export interface MatchedRecipe {
  recipe_id: string;
  slug: string;
  title: string;
  description: string;
  meal_types: MealType[];
  cuisine: string | null;
  prep_minutes: number;
  cook_minutes: number;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  tags: string[];
  diet_flags: DietFlag[];
  required_count: number;
  have_count: number;
  missing_count: number;
  missing_ingredient_ids: string[];
  missing_ingredient_names: string[];
  is_favorite: boolean;
  last_cooked_at: string | null;
}

/** One row from the recipe_with_availability RPC. */
export interface RecipeIngredientLine {
  ingredient_id: string;
  display_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  is_optional: boolean;
  prep_note: string | null;
  sort_order: number;
  in_pantry: boolean;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile: { id: string; display_name: string } | null;
}

export interface Profile {
  id: string;
  display_name: string;
  active_household_id: string | null;
}

export interface UserPreferences {
  user_id: string;
  diets: DietFlag[];
  allergen_ingredient_ids: string[];
  disliked_ingredient_ids: string[];
  preferred_meal_types: MealType[];
  max_cook_minutes: number | null;
  calorie_target: number | null;
  macro_targets: Record<string, number>;
}

/** What the parse-receipt Edge Function returns for one line of a receipt. */
export interface ParsedReceiptItem {
  raw_line: string;
  guessed_name: string;
  ingredient_slug: string | null;
  quantity: number | null;
  unit: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ParsedReceipt {
  store: string | null;
  purchased_on: string | null;
  items: ParsedReceiptItem[];
}

/** A parsed line joined to a real ingredient, as edited on the review screen. */
export interface ReviewItem extends ParsedReceiptItem {
  key: string;
  ingredient: Ingredient | null;
  include: boolean;
}
