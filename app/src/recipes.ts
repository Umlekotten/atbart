import db from "./data/recipes.json";
import { DEFAULT_THRESHOLDS, type Recipe, type RecipeDatabase } from "./types";
import { indexRecipes } from "./planner";

const database = db as unknown as RecipeDatabase;

export const recipes: Recipe[] = database.recipes ?? [];
export const thresholds = database.thresholds ?? DEFAULT_THRESHOLDS;
export const recipeById = indexRecipes(recipes);

export function getRecipe(id: string | null | undefined): Recipe | undefined {
  return id ? recipeById.get(id) : undefined;
}
