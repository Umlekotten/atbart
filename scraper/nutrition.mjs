/**
 * Uppskattar gram per ingrediens och räknar näring per portion.
 *
 * Prioritet för vikt: parentesvikt "(400 g)" > uttrycklig vikt g/kg/hg > volym × densitet
 * (gramsPerDl/msk/tsk från kartan, annars 1 g/ml) > antal × gramsPerSt > utan mängd:
 * salt = UNQUANTIFIED_SALT_GRAMS fördelat på saltraderna, övrigt 0 g.
 *
 * coverage = matchade gram / alla uppskattade gram (vatten räknas inte, okänd vikt med mängd
 * räknas som 50 g omatchat så att täckningen sjunker).
 */
import { UNQUANTIFIED_SALT_GRAMS } from "./config.mjs";
import { parseIngredientLine } from "./ingredients.mjs";
import { matchIngredient } from "./ingredient-map.mjs";

const UNIT_ML = { dl: 100, l: 1000, ml: 1, cl: 10, msk: 15, tsk: 5, krm: 1 };
const WEIGHT_G = { g: 1, kg: 1000, hg: 100 };
const COUNT_DEFAULTS = {
  klyfta: 5, skiva: 20, bit: 30, knippe: 20, kruka: 20, kvist: 2, nypa: 0.5, blad: 1,
  stjalk: 40, tarning: 10, droppe: 0.05, nave: 25, portion: 150,
};
const UNKNOWN_QUANTITY_PENALTY_GRAMS = 50;
const COOKED_OR_CANNED_RE = /\b(kokta|kokt|förkokta|förkokt|burk|burkar|konserv|tetra|på burk|i burk|avrunna|avrunnen|sköljda|färdigkokta)\b/i;
const FROZEN_RE = /\b(fryst|frysta|frusen|frusna|djupfryst)\b/i;

/**
 * Väljer livsmedel för en matchad post utifrån enhet/rad (burk/kokta -> altPackaged, tärning -> altCount).
 * Returnerar { foodId, override, name, drainedFactor, isCannedLegume, gramsPerForp }.
 */
export function resolveFood(entry, parsed) {
  const unit = parsed.unit;
  const raw = parsed.raw ?? "";
  const packagedUnit = unit === "burk" || unit === "forp";
  const cooked = COOKED_OR_CANNED_RE.test(raw);
  let alt;
  if (entry.altPackaged && (packagedUnit || cooked || (entry.defaultPackaged && parsed.parenGrams !== undefined))) {
    alt = entry.altPackaged;
  } else if (entry.altPackaged && entry.defaultPackaged && unit === undefined) {
    alt = undefined;
  }
  if (entry.altCount && (unit === "st" || unit === "tarning" || unit === "forp")) {
    return { foodId: entry.altCount.foodId, name: undefined, gramsPerSt: entry.altCount.gramsPerSt, isCannedLegume: false };
  }
  if (alt) {
    return {
      foodId: alt.foodId,
      // Om raden anger burk/förp (eller parentesvikt på en burk) är vikten bruttovikt med lag.
      drainedFactor: packagedUnit || (entry.defaultPackaged && parsed.parenGrams !== undefined) ? alt.drainedFactor : undefined,
      isCannedLegume: !!alt.isCannedLegume,
      gramsPerForp: alt.gramsPerForp,
    };
  }
  return { foodId: entry.foodId, override: entry.override, name: entry.name, isCannedLegume: false, gramsPerForp: entry.gramsPerForp };
}

/** Uppskattar gram för hela receptet. Returnerar { grams, approx, unknown, unquantifiedSalt }. */
export function estimateGrams(parsed, entry, resolved = {}) {
  const { quantity, unit, parenGrams } = parsed;
  if (quantity === undefined) {
    if (entry?.isSalt) return { grams: undefined, unquantifiedSalt: true };
    return { grams: undefined, unquantified: true };
  }
  const drained = resolved.drainedFactor ?? 1;

  if (unit in WEIGHT_G) return { grams: quantity * WEIGHT_G[unit] };

  const countLike = ["burk", "forp", "st", "tarning"];
  if (parenGrams !== undefined && countLike.includes(unit)) {
    // "1 burk (400 g)" -> 400, "2 burkar (à 400 g)" -> 800
    return { grams: parenGrams * Math.max(1, quantity) * drained, approx: drained !== 1 };
  }

  if (unit in UNIT_ML) {
    if (unit === "msk" && entry?.gramsPerMsk) return { grams: quantity * entry.gramsPerMsk };
    if (unit === "tsk" && entry?.gramsPerTsk) return { grams: quantity * entry.gramsPerTsk };
    if (unit === "krm") {
      if (entry?.gramsPerKrm) return { grams: quantity * entry.gramsPerKrm };
      if (entry?.gramsPerTsk) return { grams: quantity * entry.gramsPerTsk / 5 };
    }
    const density = (entry?.gramsPerDl ?? 100) / 100;
    return { grams: quantity * UNIT_ML[unit] * density, approx: !entry };
  }

  if (unit === "burk" || unit === "forp") {
    const per = resolved.gramsPerForp ?? entry?.gramsPerForp;
    if (per) return { grams: quantity * per * drained, approx: true };
    return { grams: quantity * 400 * drained, approx: true, guessed: true };
  }

  if (unit === "st" || unit === "tarning") {
    const per = resolved.gramsPerSt ?? entry?.gramsPerSt ?? (unit === "tarning" ? COUNT_DEFAULTS.tarning : undefined);
    if (per) return { grams: quantity * per };
    return { grams: undefined, unknown: true };
  }

  const key = {
    klyfta: "gramsPerKlyfta", skiva: "gramsPerSkiva", bit: "gramsPerBit", knippe: "gramsPerKnippe",
    kruka: "gramsPerKruka", kvist: "gramsPerKvist", nypa: "gramsPerNypa", blad: "gramsPerBlad",
    stjalk: "gramsPerStjalk", nave: "gramsPerNave", portion: "gramsPerPortion", droppe: "gramsPerDroppe",
  }[unit];
  if (key) {
    const per = entry?.[key] ?? (unit === "klyfta" ? entry?.gramsPerSt : undefined) ?? COUNT_DEFAULTS[unit];
    return { grams: quantity * per, approx: entry?.[key] === undefined };
  }
  return { grams: undefined, unknown: true };
}

/**
 * Tolkar alla recipeIngredient-rader till grupper med rika ingrediensobjekt.
 * Varje ingrediens har interna fält (prefix _) som tas bort i build.
 */
export function buildIngredientGroups(lines, nutrients) {
  const groups = [{ title: undefined, ingredients: [] }];
  const lookup = (name) => matchIngredient(name);
  const pending = [];
  for (const line of lines ?? []) {
    if (typeof line !== "string" || !line.trim()) continue;
    const parsed = parseIngredientLine(line, lookup);
    if (parsed.isHeader) {
      if (groups.length === 1 && groups[0].ingredients.length === 0) groups[0].title = parsed.name;
      else groups.push({ title: parsed.name, ingredients: [] });
      continue;
    }
    const entry = matchIngredient(parsed.name);
    const resolved = entry ? resolveFood(entry, parsed) : {};
    const food = entry ? (resolved.override ? { ...resolved.override, namn: resolved.name } : nutrients?.[resolved.foodId]) : undefined;
    const est = estimateGrams(parsed, entry, resolved);
    const ing = {
      raw: parsed.raw,
      quantity: parsed.quantity,
      unit: parsed.unit,
      name: parsed.name,
      grams: est.grams,
      foodId: entry && !resolved.override ? resolved.foodId : undefined,
      foodName: food ? (food.namn ?? resolved.name) : undefined,
      category: entry?.category ?? "ovrigt",
      matched: false,
      _entry: entry,
      _food: food,
      _est: est,
      _isCannedLegume: !!resolved.isCannedLegume,
    };
    if (est.unquantifiedSalt) pending.push(ing);
    groups[groups.length - 1].ingredients.push(ing);
  }
  // Salt utan mängd: UNQUANTIFIED_SALT_GRAMS totalt för receptet, delat på raderna.
  if (pending.length) {
    for (const ing of pending) ing.grams = UNQUANTIFIED_SALT_GRAMS / pending.length;
  }
  for (const g of groups) {
    for (const ing of g.ingredients) {
      const hasFood = !!ing._food && (ing._entry?.isWater || Number.isFinite(ing._food.protein));
      ing.matched = !!ing._entry && (ing._entry.isWater || hasFood) && (ing.grams !== undefined || ing._est.unquantified);
      if (ing.grams !== undefined) ing.grams = Math.round(ing.grams * 10) / 10;
    }
  }
  return groups;
}

export function flatIngredients(groups) {
  return groups.flatMap((g) => g.ingredients);
}

/**
 * Räknar näring per portion. `mods` är en Map ingrediens -> { gramsFactor, saltFactor }.
 */
export function computeNutrition(groups, portions, mods = new Map()) {
  let protein = 0, salt = 0, kcal = 0, potassium = 0, phosphorus = 0;
  let matchedGrams = 0, totalGrams = 0;
  for (const ing of flatIngredients(groups)) {
    const mod = mods.get(ing) ?? {};
    const gf = mod.gramsFactor ?? 1;
    const sf = mod.saltFactor ?? 1;
    if (ing._entry?.isWater) continue;
    if (ing.grams === undefined) {
      if (ing.quantity !== undefined) totalGrams += UNKNOWN_QUANTITY_PENALTY_GRAMS;
      continue;
    }
    const grams = ing.grams * gf;
    totalGrams += ing.grams;
    if (!ing.matched || !ing._food) continue;
    matchedGrams += ing.grams;
    const f = ing._food;
    protein += grams * (f.protein ?? 0) / 100;
    salt += grams * (f.salt ?? 0) / 100 * sf;
    kcal += grams * (f.kcal ?? 0) / 100;
    potassium += grams * (f.potassium ?? 0) / 100;
    phosphorus += grams * (f.phosphorus ?? 0) / 100;
  }
  const p = portions || 4;
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    protein: r1(protein / p),
    salt: Math.round(salt / p * 100) / 100,
    energyKcal: Math.round(kcal / p),
    potassium: Math.round(potassium / p),
    phosphorus: Math.round(phosphorus / p),
    coverage: totalGrams > 0 ? Math.round(matchedGrams / totalGrams * 100) / 100 : 0,
  };
}
