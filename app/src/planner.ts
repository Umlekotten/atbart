/**
 * Veckoplanering: rena funktioner utan React.
 *
 * Alla siffror är ungefärliga ("ca") och tröskelvärden/reserver nedan är
 * hackathon-antaganden som ska godkännas av dietist.
 */
import type { Recipe, StoreCategory } from "./types";
import {
  DEFAULT_BREAKFAST_ID,
  DEFAULT_LUNCH_ID,
  findBreakfast,
  findLunch,
  type StandardMeal,
} from "./standardMeals";

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

/** Reserv för mellanmål/fika per dag. hackathon-antagande, ska godkännas av dietist */
export const SNACK_RESERVE = { protein: 5, salt: 0.5, energyKcal: 150 };

/** En dag får aldrig planeras under 70 % av dagsmålet (protein). hackathon-antagande, ska godkännas av dietist */
export const DAY_FLOOR = 0.7;

/** En dag får aldrig planeras över 130 % av dagsmålet. hackathon-antagande, ska godkännas av dietist */
export const DAY_CEILING = 1.3;

/** Riktvärde tills man träffat sin dietist: 0,8 g protein per kg kroppsvikt, under 5 g salt. hackathon-antagande, ska godkännas av dietist */
export const RIKTVARDE_PROTEIN_PER_KG = 0.8;
export const RIKTVARDE_SALT = 5;

/** Vid dialys behövs oftast 1,0–1,2 g/kg, dvs. mer protein. Appen stödjer inte det. */
export const DIALYSIS_PROTEIN_PER_KG = [1.0, 1.2] as const;

/** Under så här många kandidatrecept släpper vi på "bara enkla"-filtret. hackathon-antagande */
const MIN_CANDIDATES = 9;

/** Max antal middagar med kött per vecka. hackathon-antagande, ska godkännas av dietist */
const MAX_KOTT_PER_WEEK = 2;

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

export interface Profile {
  weightKg: number;
  /** g protein per dag */
  proteinTarget: number;
  /** g salt per dag */
  saltTarget: number;
  targetSource: "dietist" | "riktvarde";
  dialysis: boolean;
  /** 1–4 */
  portions: number;
  effortPref: "alla" | "enkel";
}

export interface Macro {
  protein: number;
  salt: number;
  energyKcal: number;
}

export interface DayPlan {
  /** 0 = måndag ... 6 = söndag */
  dayIndex: number;
  /** Recipe.id eller null om inget recept hittades */
  dinner: string | null;
  breakfastId: string;
  lunchId: string;
}

export interface WeekPlan {
  seed: number;
  days: DayPlan[];
}

export interface PlanOptions {
  /** Låsta middagar per dag: recipeId behålls, null/undefined planeras om. */
  locked?: (string | null | undefined)[];
  seed?: number;
}

export interface DayTotals extends Macro {
  target: { protein: number; salt: number };
  breakfast: Macro;
  lunch: Macro;
  dinner: Macro;
  snack: Macro;
}

export interface WeekTotals extends Macro {
  budget: { protein: number; salt: number };
  perDay: DayTotals[];
}

export interface ShoppingItem {
  key: string;
  name: string;
  /** Färdig mängdtext, t.ex. "ca 150 g", "2 dl", "1 st". Tom om okänd. */
  amount: string;
  recipeIds: string[];
}

export interface ShoppingGroup {
  category: StoreCategory;
  label: string;
  items: ShoppingItem[];
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------

const ZERO: Macro = { protein: 0, salt: 0, energyKcal: 0 };

function add(...ms: Macro[]): Macro {
  return ms.reduce(
    (acc, m) => ({
      protein: acc.protein + m.protein,
      salt: acc.salt + m.salt,
      energyKcal: acc.energyKcal + m.energyKcal,
    }),
    ZERO
  );
}

function mealMacro(m: StandardMeal): Macro {
  return { protein: m.protein, salt: m.salt, energyKcal: m.energyKcal };
}

function recipeMacro(r: Recipe): Macro {
  return {
    protein: r.adaptedNutrition.protein,
    salt: r.adaptedNutrition.salt,
    energyKcal: r.adaptedNutrition.energyKcal,
  };
}

/** Liten deterministisk slumpgenerator (mulberry32) så demon blir repeterbar. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function indexRecipes(recipes: Recipe[]): Map<string, Recipe> {
  return new Map(recipes.map((r) => [r.id, r]));
}

/** Riktvärde enligt nationella riktlinjer, tills man träffat sin dietist. */
export function riktvarde(weightKg: number): { protein: number; salt: number } {
  return { protein: Math.round(RIKTVARDE_PROTEIN_PER_KG * weightKg), salt: RIKTVARDE_SALT };
}

/**
 * Recept som får planeras in: passar/anpassa, helst middagar, och enligt effortPref.
 * Faller tillbaka till fler recept om urvalet blir för litet.
 */
export function plannableRecipes(recipes: Recipe[], profile: Profile): Recipe[] {
  const fitting = recipes.filter((r) => r.fit === "passar" || r.fit === "anpassa");
  const dinners = fitting.filter((r) => r.mealType === "middag");
  const pool = dinners.length >= MIN_CANDIDATES ? dinners : fitting;
  if (profile.effortPref === "enkel") {
    const enkel = pool.filter((r) => r.effort === "enkel");
    if (enkel.length >= MIN_CANDIDATES) return enkel;
    const medel = pool.filter((r) => r.effort !== "fran-grunden");
    if (medel.length >= MIN_CANDIDATES) return medel;
  }
  return pool;
}

/** Vad middagen får kosta en dag: mål − frukost − lunch − mellanmålsreserv. */
export function dailyDinnerAllowance(
  profile: Profile,
  breakfast: Macro,
  lunch: Macro
): { protein: number; salt: number } {
  return {
    protein: profile.proteinTarget - breakfast.protein - lunch.protein - SNACK_RESERVE.protein,
    salt: profile.saltTarget - breakfast.salt - lunch.salt - SNACK_RESERVE.salt,
  };
}

/** Lunchens näring. "Rester" använder gårdagens middag om det finns en. */
function lunchMacroFor(
  prev: DayPlan | null,
  lunchId: string,
  byId: Map<string, Recipe>
): Macro {
  const lunch = findLunch(lunchId);
  if (lunch.usesLeftovers && prev && prev.dinner) {
    const r = byId.get(prev.dinner);
    if (r) return recipeMacro(r);
  }
  return mealMacro(lunch);
}

function dinnerMacroFor(day: DayPlan, byId: Map<string, Recipe>): Macro {
  if (!day.dinner) return ZERO;
  const r = byId.get(day.dinner);
  return r ? recipeMacro(r) : ZERO;
}

interface ChoiceContext {
  exclude: Set<string>;
  avoidSources: (string | undefined)[];
  kottCount: number;
  allowance: { protein: number; salt: number };
  floorDinner: number;
  ceilDinner: { protein: number; salt: number };
}

/**
 * Väljer en middag ur `candidates` (som redan är blandade med seed).
 * Filtren släpps ett i taget om inget recept klarar alla.
 */
function chooseDinner(candidates: Recipe[], ctx: ChoiceContext): Recipe | null {
  type Filter = (r: Recipe) => boolean;
  const notUsed: Filter = (r) => !ctx.exclude.has(r.id);
  const kott: Filter = (r) => r.proteinSource !== "kott" || ctx.kottCount < MAX_KOTT_PER_WEEK;
  const variety: Filter = (r) => !ctx.avoidSources.includes(r.proteinSource);
  const ceiling: Filter = (r) =>
    r.adaptedNutrition.protein <= ctx.ceilDinner.protein && r.adaptedNutrition.salt <= ctx.ceilDinner.salt;
  const allowance: Filter = (r) =>
    r.adaptedNutrition.protein <= ctx.allowance.protein && r.adaptedNutrition.salt <= ctx.allowance.salt;
  const floor: Filter = (r) => r.adaptedNutrition.protein >= ctx.floorDinner;

  // Från strängast till mest tillåtande.
  const stages: Filter[][] = [
    [notUsed, kott, variety, ceiling, allowance, floor],
    [notUsed, kott, variety, ceiling, allowance],
    [notUsed, kott, ceiling, allowance],
    [notUsed, kott, ceiling],
    [notUsed, ceiling],
    [notUsed],
  ];

  for (const filters of stages) {
    const ok = candidates.filter((r) => filters.every((f) => f(r)));
    if (ok.length > 0) return ok[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Veckoplan
// ---------------------------------------------------------------------------

export function planWeek(recipes: Recipe[], profile: Profile, opts: PlanOptions = {}): WeekPlan {
  if (profile.dialysis) {
    throw new Error("Vid dialys behövs oftast mer protein. Appen planerar inte veckor för dialys.");
  }
  const seed = opts.seed ?? 1;
  const rand = rng(seed);
  const byId = indexRecipes(recipes);
  const candidates = shuffle(plannableRecipes(recipes, profile), rand);
  const locked = opts.locked ?? [];

  const used = new Set<string>();
  let kottCount = 0;
  for (let d = 0; d < 7; d++) {
    const id = locked[d];
    if (id && byId.has(id)) {
      used.add(id);
      if (byId.get(id)!.proteinSource === "kott") kottCount++;
    }
  }

  const days: DayPlan[] = [];
  for (let d = 0; d < 7; d++) {
    const prev = d > 0 ? days[d - 1] : null;
    const base: DayPlan = {
      dayIndex: d,
      dinner: null,
      breakfastId: DEFAULT_BREAKFAST_ID,
      lunchId: DEFAULT_LUNCH_ID,
    };
    const lockedId = locked[d];
    if (lockedId && byId.has(lockedId)) {
      days.push({ ...base, dinner: lockedId });
      continue;
    }

    const breakfast = mealMacro(findBreakfast(base.breakfastId));
    const lunch = lunchMacroFor(prev, base.lunchId, byId);
    const fixed = add(breakfast, lunch, SNACK_RESERVE);
    const pick = chooseDinner(candidates, {
      exclude: used,
      avoidSources: [prev?.dinner ? byId.get(prev.dinner)?.proteinSource : undefined],
      kottCount,
      allowance: dailyDinnerAllowance(profile, breakfast, lunch),
      floorDinner: DAY_FLOOR * profile.proteinTarget - fixed.protein,
      ceilDinner: {
        protein: DAY_CEILING * profile.proteinTarget - fixed.protein,
        salt: DAY_CEILING * profile.saltTarget - fixed.salt,
      },
    });
    if (pick) {
      used.add(pick.id);
      if (pick.proteinSource === "kott") kottCount++;
    }
    days.push({ ...base, dinner: pick?.id ?? null });
  }

  return repairWeekBudget({ seed, days }, recipes, profile, candidates, locked);
}

/**
 * Om veckan ändå landar över 7 × dagsmål: byt den tyngsta olåsta middagen
 * mot något lättare tills det går, eller tills inget mer går att göra.
 */
function repairWeekBudget(
  plan: WeekPlan,
  recipes: Recipe[],
  profile: Profile,
  candidates: Recipe[],
  locked: (string | null | undefined)[]
): WeekPlan {
  const byId = indexRecipes(recipes);
  let current = plan;
  for (let iteration = 0; iteration < 7; iteration++) {
    const totals = weekTotals(current, recipes, profile);
    const overProtein = totals.protein - totals.budget.protein;
    const overSalt = totals.salt - totals.budget.salt;
    if (overProtein <= 1e-6 && overSalt <= 1e-6) return current;

    const used = new Set(current.days.map((d) => d.dinner).filter((x): x is string => !!x));
    let best: { dayIndex: number; recipe: Recipe; gain: number } | null = null;
    current.days.forEach((day, i) => {
      if (!day.dinner || locked[i]) return;
      const cur = byId.get(day.dinner);
      if (!cur) return;
      for (const r of candidates) {
        if (used.has(r.id)) continue;
        const gain =
          (overProtein > 0 ? cur.adaptedNutrition.protein - r.adaptedNutrition.protein : 0) +
          (overSalt > 0 ? (cur.adaptedNutrition.salt - r.adaptedNutrition.salt) * 10 : 0);
        if (gain > 0 && (!best || gain > best.gain)) best = { dayIndex: i, recipe: r, gain };
      }
    });
    if (!best) return current;
    const b: { dayIndex: number; recipe: Recipe } = best;
    current = {
      ...current,
      days: current.days.map((d, i) => (i === b.dayIndex ? { ...d, dinner: b.recipe.id } : d)),
    };
  }
  return current;
}

/** Byt middag en dag mot ett annat recept som passar dagens utrymme. */
export function swapDinner(
  plan: WeekPlan,
  dayIndex: number,
  recipes: Recipe[],
  profile: Profile,
  seed: number
): WeekPlan {
  const day = plan.days[dayIndex];
  if (!day) return plan;
  const byId = indexRecipes(recipes);
  const candidates = shuffle(plannableRecipes(recipes, profile), rng(seed));

  const exclude = new Set<string>();
  let kottCount = 0;
  plan.days.forEach((d, i) => {
    if (d.dinner) {
      exclude.add(d.dinner);
      if (i !== dayIndex && byId.get(d.dinner)?.proteinSource === "kott") kottCount++;
    }
  });
  if (day.dinner) exclude.add(day.dinner);

  const prev = dayIndex > 0 ? plan.days[dayIndex - 1] : null;
  const next = dayIndex < 6 ? plan.days[dayIndex + 1] : null;
  const breakfast = mealMacro(findBreakfast(day.breakfastId));
  const lunch = lunchMacroFor(prev, day.lunchId, byId);
  const fixed = add(breakfast, lunch, SNACK_RESERVE);

  const pick = chooseDinner(candidates, {
    exclude,
    avoidSources: [
      prev?.dinner ? byId.get(prev.dinner)?.proteinSource : undefined,
      next?.dinner ? byId.get(next.dinner)?.proteinSource : undefined,
    ],
    kottCount,
    allowance: dailyDinnerAllowance(profile, breakfast, lunch),
    floorDinner: DAY_FLOOR * profile.proteinTarget - fixed.protein,
    ceilDinner: {
      protein: DAY_CEILING * profile.proteinTarget - fixed.protein,
      salt: DAY_CEILING * profile.saltTarget - fixed.salt,
    },
  });
  if (!pick) return plan;
  return {
    ...plan,
    days: plan.days.map((d, i) => (i === dayIndex ? { ...d, dinner: pick.id } : d)),
  };
}

/** Lägg in ett valt recept en dag (t.ex. "Lägg in i kväll"). */
export function setDinner(plan: WeekPlan, dayIndex: number, recipeId: string): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((d, i) => (i === dayIndex ? { ...d, dinner: recipeId } : d)),
  };
}

// ---------------------------------------------------------------------------
// Summering
// ---------------------------------------------------------------------------

export function dayTotals(plan: WeekPlan, dayIndex: number, recipes: Recipe[], profile: Profile): DayTotals {
  const byId = indexRecipes(recipes);
  return dayTotalsWithIndex(plan, dayIndex, byId, profile);
}

function dayTotalsWithIndex(
  plan: WeekPlan,
  dayIndex: number,
  byId: Map<string, Recipe>,
  profile: Profile
): DayTotals {
  const day = plan.days[dayIndex];
  const prev = dayIndex > 0 ? plan.days[dayIndex - 1] : null;
  const breakfast = mealMacro(findBreakfast(day.breakfastId));
  const lunch = lunchMacroFor(prev, day.lunchId, byId);
  const dinner = dinnerMacroFor(day, byId);
  const snack = SNACK_RESERVE;
  const total = add(breakfast, lunch, dinner, snack);
  return {
    ...total,
    target: { protein: profile.proteinTarget, salt: profile.saltTarget },
    breakfast,
    lunch,
    dinner,
    snack,
  };
}

export function weekTotals(plan: WeekPlan, recipes: Recipe[], profile: Profile): WeekTotals {
  const byId = indexRecipes(recipes);
  const perDay = plan.days.map((_, i) => dayTotalsWithIndex(plan, i, byId, profile));
  const total = add(...perDay);
  return {
    ...total,
    budget: { protein: profile.proteinTarget * 7, salt: profile.saltTarget * 7 },
    perDay,
  };
}

/** Middagens utrymme en viss dag i en färdig plan (för UI). */
export function dayAllowance(
  plan: WeekPlan,
  dayIndex: number,
  recipes: Recipe[],
  profile: Profile
): { protein: number; salt: number } {
  const byId = indexRecipes(recipes);
  const day = plan.days[dayIndex];
  const prev = dayIndex > 0 ? plan.days[dayIndex - 1] : null;
  return dailyDinnerAllowance(
    profile,
    mealMacro(findBreakfast(day.breakfastId)),
    lunchMacroFor(prev, day.lunchId, byId)
  );
}

// ---------------------------------------------------------------------------
// Inköpslista
// ---------------------------------------------------------------------------

export const STORE_CATEGORY_LABEL: Record<StoreCategory, string> = {
  "gronsaker-frukt": "Grönsaker & frukt",
  "kott-fagel": "Kött & fågel",
  "fisk-skaldjur": "Fisk & skaldjur",
  "mejeri-agg": "Mejeri & ägg",
  brod: "Bröd",
  skafferi: "Skafferi",
  frys: "Frys",
  "kryddor-smaksattare": "Kryddor & smaksättare",
  ovrigt: "Övrigt",
};

const STORE_CATEGORY_ORDER: StoreCategory[] = [
  "gronsaker-frukt",
  "kott-fagel",
  "fisk-skaldjur",
  "mejeri-agg",
  "brod",
  "skafferi",
  "frys",
  "kryddor-smaksattare",
  "ovrigt",
];

const COUNT_UNITS = new Set(["st", "klyfta", "burk", "forp", "knippe", "kruka", "pase"]);
const COUNT_UNIT_LABEL: Record<string, [string, string]> = {
  st: ["st", "st"],
  klyfta: ["klyfta", "klyftor"],
  burk: ["burk", "burkar"],
  forp: ["förp", "förp"],
  knippe: ["knippe", "knippen"],
  kruka: ["kruka", "krukor"],
  pase: ["påse", "påsar"],
};

function fmtNumber(n: number, decimals: number): string {
  const s = n.toFixed(decimals).replace(".", ",");
  return s.replace(/,0+$/, "");
}

interface Accumulator {
  key: string;
  name: string;
  category: StoreCategory;
  grams: number;
  gramsComplete: boolean;
  count: number;
  countUnit: string | null;
  volumes: Map<string, number>;
  recipeIds: Set<string>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function amountLabel(acc: Accumulator): string {
  if (acc.countUnit && acc.count > 0) {
    const n = Math.ceil(acc.count - 1e-9);
    const [one, many] = COUNT_UNIT_LABEL[acc.countUnit] ?? [acc.countUnit, acc.countUnit];
    return `${n} ${n === 1 ? one : many}`;
  }
  if (acc.gramsComplete && acc.grams > 0) {
    return acc.grams >= 1000 ? `ca ${fmtNumber(acc.grams / 1000, 1)} kg` : `ca ${Math.round(acc.grams)} g`;
  }
  if (acc.volumes.size > 0) {
    return [...acc.volumes.entries()]
      .map(([unit, q]) => `${fmtNumber(q, q < 1 ? 2 : 1)} ${unit}`)
      .join(" + ");
  }
  if (acc.grams > 0) return `ca ${Math.round(acc.grams)} g`;
  return "";
}

/**
 * Inköpslista för veckans middagar, grupperad per butikskategori.
 * Mängder skalas med portions / recipe.portions och med den njurvänliga versionens
 * anpassningsfaktor (borttaget salt hamnar inte på listan, halverat kött halveras). Dubbletter slås ihop.
 */
export function shoppingList(plan: WeekPlan, recipes: Recipe[], portions: number): ShoppingGroup[] {
  const byId = indexRecipes(recipes);
  const acc = new Map<string, Accumulator>();

  for (const day of plan.days) {
    if (!day.dinner) continue;
    const recipe = byId.get(day.dinner);
    if (!recipe) continue;
    const portionFactor = portions / Math.max(recipe.portions, 1);

    for (const group of recipe.ingredientGroups) {
      for (const ing of group.ingredients) {
        const adaptFactor = ing.adapted?.factor ?? 1;
        if (adaptFactor === 0) continue;
        const factor = portionFactor * adaptFactor;
        const key = `${ing.category}|${normalizeName(ing.name)}`;
        let a = acc.get(key);
        if (!a) {
          a = {
            key,
            name: ing.name.trim(),
            category: ing.category,
            grams: 0,
            gramsComplete: true,
            count: 0,
            countUnit: null,
            volumes: new Map(),
            recipeIds: new Set(),
          };
          acc.set(key, a);
        }
        a.recipeIds.add(recipe.id);
        if (typeof ing.grams === "number") a.grams += ing.grams * factor;
        else a.gramsComplete = false;

        if (typeof ing.quantity === "number") {
          const unit = ing.unit ?? "st";
          if (COUNT_UNITS.has(unit)) {
            a.count += ing.quantity * factor;
            a.countUnit = a.countUnit ?? unit;
          } else if (unit !== "g" && unit !== "kg") {
            a.volumes.set(unit, (a.volumes.get(unit) ?? 0) + ing.quantity * factor);
          }
        }
      }
    }
  }

  const groups: ShoppingGroup[] = [];
  for (const category of STORE_CATEGORY_ORDER) {
    const items = [...acc.values()]
      .filter((a) => a.category === category)
      .sort((x, y) => x.name.localeCompare(y.name, "sv"))
      .map((a) => ({
        key: a.key,
        name: a.name,
        amount: amountLabel(a),
        recipeIds: [...a.recipeIds],
      }));
    if (items.length > 0) groups.push({ category, label: STORE_CATEGORY_LABEL[category], items });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Beskrivningar (rena strängar, används i UI och kan testas)
// ---------------------------------------------------------------------------

/** En mening om varför ett recept inte passar, utifrån siffrorna. */
export function whyNotFit(recipe: Recipe, thresholds: { proteinMax: number; saltMax: number }): string {
  const n = recipe.adaptedNutrition;
  const tooMuchProtein = n.protein > thresholds.proteinMax;
  const tooMuchSalt = n.salt > thresholds.saltMax;
  const p = `ca ${Math.round(n.protein)} g protein`;
  const s = `ca ${n.salt.toFixed(1).replace(".", ",")} g salt`;
  const suffix = recipe.adaptations.length > 0 ? " även efter anpassningar" : "";
  if (tooMuchProtein && tooMuchSalt) return `För mycket protein och salt per portion (${p}, ${s})${suffix}.`;
  if (tooMuchProtein) return `För mycket protein per portion (${p})${suffix}.`;
  if (tooMuchSalt) return `För mycket salt per portion (${s})${suffix}.`;
  return "Passar inte en protein- och saltreducerad kost.";
}
