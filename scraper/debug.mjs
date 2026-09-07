/**
 * Felsökning: node debug.mjs <slug> [--json]
 * Bygger receptet från cachad HTML (eller .cache/raw) och skriver ut ingredienser, gram, näring och anpassningar.
 */
import fs from "node:fs";
import path from "node:path";
import { readJson, HTML_DIR, RAW_DIR, DATA_DIR, KOKET_BASE, safeFileName } from "./config.mjs";
import { extractRecipe, normalizeRecipe } from "./scrape.mjs";
import { assembleRecipe } from "./build.mjs";

const slug = process.argv[2];
if (!slug) { console.error("Ange slug"); process.exit(1); }
const nutrients = readJson(path.join(DATA_DIR, "nutrients.json"));
let raw = readJson(path.join(RAW_DIR, `${safeFileName(slug)}.json`));
if (!raw) {
  const html = fs.readFileSync(path.join(HTML_DIR, `${safeFileName(slug)}.html`), "utf8");
  raw = normalizeRecipe(extractRecipe(html), slug, `${KOKET_BASE}/${slug}`);
}
const { recipe, groups } = assembleRecipe(raw, nutrients);
if (process.argv.includes("--json")) { console.log(JSON.stringify(recipe, null, 2)); process.exit(0); }
console.log(`${recipe.name} | ${recipe.portions} portioner | ${recipe.totalMinutes ?? "?"} min | ${recipe.mealType} | ${recipe.effort} | ${recipe.proteinSource}`);
for (const g of groups) {
  if (g.title) console.log(`  [${g.title}]`);
  for (const i of g.ingredients) {
    const food = i._food ? `${i.foodName} (P ${i._food.protein}/S ${i._food.salt})` : "-";
    const flags = i._entry ? Object.keys(i._entry).filter((k) => k.startsWith("is") && i._entry[k]).join(",") : "";
    console.log(`    ${i.raw.padEnd(45).slice(0, 45)} q=${i.quantity ?? "-"} ${i.unit ?? ""} g=${i.grams ?? "?"} ${i.matched ? "OK " : "-- "} ${food} ${flags} ${i._isCannedLegume ? "burk" : ""}`);
  }
}
console.log("nutrition:", recipe.nutrition);
console.log("adapted:  ", recipe.adaptedNutrition);
console.log("fit:", recipe.fit);
for (const a of recipe.adaptations) console.log(`  - ${a.kind}: ${a.text} ${JSON.stringify(a.effect ?? {})}`);
