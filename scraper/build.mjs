/**
 * Steg 4: sätt ihop RecipeDatabase från .cache/raw/*.json + data/nutrients.json.
 * Skriver data/recipes.json, app/src/data/recipes.json och data/recipes-summary.md.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ensureDirs, readJson, writeJson, isMain, parseIsoDuration, parsePortions,
  DEFAULT_THRESHOLDS, RAW_DIR, DATA_DIR, APP_DATA_DIR, MIN_COVERAGE,
} from "./config.mjs";
import { buildIngredientGroups, computeNutrition, flatIngredients } from "./nutrition.mjs";
import { buildAdaptations, fitFor, effortFor, proteinSourceFor, mealTypeFor } from "./classify.mjs";

export function assembleRecipe(raw, nutrients) {
  const portions = parsePortions(raw.recipeYield);
  const groups = buildIngredientGroups(raw.recipeIngredient, nutrients);
  const nutrition = computeNutrition(groups, portions);
  const { adaptations, adaptedNutrition, ingredientMods } = buildAdaptations(groups, portions, nutrition);
  const totalMinutes = parseIsoDuration(raw.totalTime);
  // Antal ingredienser för effort: rader med mängd (salt/peppar/olja "till stekning" räknas inte).
  const nIngredients = flatIngredients(groups).filter((i) => i.quantity !== undefined).length;

  const ingredientGroups = groups.map((g) => ({
    ...(g.title ? { title: g.title } : {}),
    ingredients: g.ingredients.map((i) => ({
      raw: i.raw,
      ...(i.quantity !== undefined ? { quantity: Math.round(i.quantity * 1000) / 1000 } : {}),
      ...(i.unit !== undefined ? { unit: i.unit } : {}),
      name: i.name,
      ...(i.grams !== undefined ? { grams: i.grams } : {}),
      ...(i.foodId !== undefined ? { foodId: i.foodId } : {}),
      ...(i.foodName !== undefined ? { foodName: i.foodName } : {}),
      category: i.category,
      matched: i.matched,
      ...(ingredientMods.get(i) ? { adapted: ingredientMods.get(i) } : {}),
    })),
  }));

  const recipe = {
    id: raw.slug,
    source: "koket.se",
    sourceUrl: raw.url,
    name: raw.name,
    description: raw.description ?? "",
    image: raw.image ?? "",
    ...(raw.author ? { author: raw.author } : {}),
    ...(totalMinutes !== undefined ? { totalMinutes } : {}),
    portions,
    mealType: mealTypeFor(raw.recipeCategory, raw.keywords),
    effort: effortFor(totalMinutes, nIngredients),
    category: raw.recipeCategory ?? [],
    cuisine: raw.recipeCuisine ?? [],
    keywords: raw.keywords ?? [],
    proteinSource: proteinSourceFor(groups),
    ingredientGroups,
    instructions: raw.recipeInstructions ?? [],
    nutrition,
    adaptedNutrition,
    adaptations,
    fit: fitFor(nutrition, adaptedNutrition),
  };
  return { recipe, groups };
}

function pct(n, d) { return d ? `${Math.round(n / d * 100)} %` : "–"; }

export function build() {
  ensureDirs();
  const nutrients = readJson(path.join(DATA_DIR, "nutrients.json"));
  if (!nutrients) throw new Error("data/nutrients.json saknas: kör foods först.");
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json")).sort();
  console.log(`Bygger från ${files.length} råa recept ...`);

  const kept = [];
  const dropped = { mealType: 0, coverage: 0, noIngredients: 0, implausible: 0 };
  const unmatched = new Map();
  const coverageAll = [];
  for (const f of files) {
    const raw = readJson(path.join(RAW_DIR, f));
    if (!raw?.recipeIngredient?.length) { dropped.noIngredients++; continue; }
    const { recipe, groups } = assembleRecipe(raw, nutrients);
    coverageAll.push(recipe.nutrition.coverage);
    for (const i of flatIngredients(groups)) {
      if (!i.matched && !i._entry) {
        const key = i.name.toLowerCase();
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
      }
    }
    if (!["middag", "lunch"].includes(recipe.mealType)) { dropped.mealType++; continue; }
    if (recipe.nutrition.coverage < MIN_COVERAGE) { dropped.coverage++; continue; }
    // Orimliga värden som skrivet tyder på tolkningsfel (t.ex. portioner eller enheter): släng hellre än visa.
    if (recipe.nutrition.protein > 80 || recipe.nutrition.salt > 10) { dropped.implausible++; continue; }
    kept.push(recipe);
  }
  // Teamets egna recept (data/egna-recept.json) följer samma schema och läggs till som de är.
  const egna = readJson(path.join(DATA_DIR, "egna-recept.json"));
  if (egna?.recipes?.length) kept.push(...egna.recipes);
  kept.sort((a, b) => a.id.localeCompare(b.id));

  const db = { generatedAt: new Date().toISOString(), thresholds: { ...DEFAULT_THRESHOLDS }, recipes: kept };
  writeJson(path.join(DATA_DIR, "recipes.json"), db, true);
  writeJson(path.join(APP_DATA_DIR, "recipes.json"), db, true);

  // Statistik
  const count = (arr, key) => arr.reduce((m, r) => (m[r[key]] = (m[r[key]] ?? 0) + 1, m), {});
  const byFit = count(kept, "fit");
  const byEffort = count(kept, "effort");
  const bySource = count(kept, "proteinSource");
  const byMeal = count(kept, "mealType");
  const buckets = { "0.6–0.7": 0, "0.7–0.8": 0, "0.8–0.9": 0, "0.9–1.0": 0 };
  for (const r of kept) {
    const c = r.nutrition.coverage;
    if (c < 0.7) buckets["0.6–0.7"]++; else if (c < 0.8) buckets["0.7–0.8"]++; else if (c < 0.9) buckets["0.8–0.9"]++; else buckets["0.9–1.0"]++;
  }
  const meanCov = kept.length ? kept.reduce((s, r) => s + r.nutrition.coverage, 0) / kept.length : 0;
  const topUnmatched = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const adaptationKinds = {};
  for (const r of kept) for (const a of r.adaptations) adaptationKinds[a.kind] = (adaptationKinds[a.kind] ?? 0) + 1;

  const n = kept.length;
  const lines = [];
  lines.push(`# Receptbank – sammanfattning`, ``, `Genererad: ${db.generatedAt}`, ``);
  lines.push(`Råa recept: ${files.length}. Bortfiltrerade: ${dropped.mealType} (ej middag/lunch), ${dropped.coverage} (täckning < ${MIN_COVERAGE}), ${dropped.noIngredients} (inga ingredienser), ${dropped.implausible} (orimliga värden). **Kvar: ${n}.**`, ``);
  lines.push(`Tröskelvärden per portion: protein ≤ ${DEFAULT_THRESHOLDS.proteinMax} g, salt ≤ ${DEFAULT_THRESHOLDS.saltMax} g.`, ``);
  lines.push(`## Fit`, ``, `| fit | antal | andel |`, `|---|---|---|`);
  for (const k of ["passar", "anpassa", "passar-inte"]) lines.push(`| ${k} | ${byFit[k] ?? 0} | ${pct(byFit[k] ?? 0, n)} |`);
  lines.push(`| passar + anpassa | ${(byFit.passar ?? 0) + (byFit.anpassa ?? 0)} | ${pct((byFit.passar ?? 0) + (byFit.anpassa ?? 0), n)} |`, ``);
  lines.push(`## Effort`, ``, `| effort | antal |`, `|---|---|`);
  for (const [k, v] of Object.entries(byEffort)) lines.push(`| ${k} | ${v} |`);
  lines.push(``, `## Proteinkälla`, ``, `| proteinSource | antal |`, `|---|---|`);
  for (const [k, v] of Object.entries(bySource)) lines.push(`| ${k} | ${v} |`);
  lines.push(``, `## Måltidstyp`, ``, `| mealType | antal |`, `|---|---|`);
  for (const [k, v] of Object.entries(byMeal)) lines.push(`| ${k} | ${v} |`);
  lines.push(``, `## Täckning (andel ingrediensvikt som matchats)`, ``, `Medel: ${meanCov.toFixed(2)}`, ``, `| intervall | antal |`, `|---|---|`);
  for (const [k, v] of Object.entries(buckets)) lines.push(`| ${k} | ${v} |`);
  lines.push(``, `## Anpassningar (antal recept per typ)`, ``, `| kind | antal |`, `|---|---|`);
  for (const [k, v] of Object.entries(adaptationKinds).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  lines.push(``, `## 30 vanligaste omatchade ingrediensnamnen`, ``, `| namn | antal |`, `|---|---|`);
  for (const [k, v] of topUnmatched) lines.push(`| ${k.replace(/\|/g, "/")} | ${v} |`);
  lines.push(``, `## Alla recept`, ``, `| namn | fit | protein | anpassat protein | salt | anpassat salt | effort | url |`, `|---|---|---|---|---|---|---|---|`);
  for (const r of kept) {
    lines.push(`| ${r.name.replace(/\|/g, "/")} | ${r.fit} | ${r.nutrition.protein} | ${r.adaptedNutrition.protein} | ${r.nutrition.salt} | ${r.adaptedNutrition.salt} | ${r.effort} | ${r.sourceUrl} |`);
  }
  fs.writeFileSync(path.join(DATA_DIR, "recipes-summary.md"), lines.join("\n") + "\n");

  console.log(`\nKlart: ${n} recept -> data/recipes.json och app/src/data/recipes.json`);
  console.log("Bortfiltrerade:", dropped);
  console.log("Fit:", byFit, `| passar+anpassa: ${pct((byFit.passar ?? 0) + (byFit.anpassa ?? 0), n)}`);
  console.log("Effort:", byEffort);
  console.log("Proteinkälla:", bySource);
  console.log(`Täckning: medel ${meanCov.toFixed(2)}`, buckets);
  console.log("Anpassningar:", adaptationKinds);
  console.log("Topp omatchade:", topUnmatched.slice(0, 30).map(([k, v]) => `${k} (${v})`).join(", "));

  for (const fit of ["passar", "anpassa", "passar-inte"]) {
    console.log(`\nExempel ${fit}:`);
    for (const r of kept.filter((r) => r.fit === fit).slice(0, 5)) {
      console.log(`  ${r.name} | protein ${r.nutrition.protein} -> ${r.adaptedNutrition.protein} g | salt ${r.nutrition.salt} -> ${r.adaptedNutrition.salt} g | täckning ${r.nutrition.coverage} | ${r.proteinSource} | ${r.adaptations.map((a) => a.kind).join(",") || "-"}`);
    }
  }
  const torsk = kept.find((r) => r.id === "torsk-med-brynt-kapris-och-citronsmor");
  if (torsk) {
    console.log(`\nSanity: ${torsk.name}: ${torsk.portions} portioner, protein ${torsk.nutrition.protein} g -> ${torsk.adaptedNutrition.protein} g, salt ${torsk.nutrition.salt} -> ${torsk.adaptedNutrition.salt} g, fit ${torsk.fit}, täckning ${torsk.nutrition.coverage}`);
    for (const a of torsk.adaptations) console.log(`   - ${a.kind}: ${a.text} ${JSON.stringify(a.effect ?? {})}`);
  }
  return db;
}

if (isMain(import.meta.url)) {
  try { build(); } catch (e) { console.error(e); process.exit(1); }
}
