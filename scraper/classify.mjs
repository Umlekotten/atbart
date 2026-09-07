/**
 * Anpassningar ("så gör du den njurvänlig"), omräknad näring, fit, effort, proteinkälla, måltidstyp.
 */
import { DEFAULT_THRESHOLDS } from "./config.mjs";
import { computeNutrition, flatIngredients } from "./nutrition.mjs";

/** Kött/fisk/fågel per portion: över TRIGGER föreslås minskning till PRIMARY, räcker inte det testas FLOOR. */
export const MEAT_TRIGGER_G = 125;
export const MEAT_TARGET_PRIMARY_G = 100;
export const MEAT_TARGET_FLOOR_G = 75;

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

function listNames(ings, max = 3) {
  const names = [...new Set(ings.map((i) => i.name.toLowerCase()))].slice(0, max);
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(", ") + " och " + names[names.length - 1];
}

function fits(n, t = DEFAULT_THRESHOLDS) {
  return n.protein <= t.proteinMax && n.salt <= t.saltMax;
}

/**
 * Bygger anpassningar utifrån flaggor och räknar om näringen.
 * Returnerar { adaptations, adaptedNutrition }.
 */
export function buildAdaptations(groups, portions, base, thresholds = DEFAULT_THRESHOLDS) {
  const ings = flatIngredients(groups).filter((i) => i.matched && i._entry && i.grams > 0 && !i._entry.isWater);
  const adaptations = [];

  const salt = ings.filter((i) => i._entry.isSalt);
  if (salt.length) {
    adaptations.push({
      kind: "skippa-salt",
      text: "Hoppa över saltet och smaka av med citron, peppar och örter i stället.",
      _ings: salt, _mod: { gramsFactor: 0 },
    });
  }
  const stock = ings.filter((i) => i._entry.isStock);
  if (stock.length) {
    adaptations.push({
      kind: "byt-buljong",
      text: "Byt buljongen eller fonden mot vatten med lök, lagerblad och peppar, eller egen fond utan salt.",
      _ings: stock, _mod: { saltFactor: 0.2 },
    });
  }
  const cheese = ings.filter((i) => i._entry.isSaltyCheese);
  if (cheese.length) {
    adaptations.push({
      kind: "byt-ost",
      text: `Halvera mängden ${listNames(cheese)} eller byt till en mildare och mindre salt ost.`,
      _ings: cheese, _mod: { gramsFactor: 0.5 },
    });
  }
  const canned = ings.filter((i) => i._isCannedLegume);
  if (canned.length) {
    adaptations.push({
      kind: "skolj-konserv",
      text: `Skölj ${listNames(canned)} noga i kallt vatten innan du använder dem, det tar bort en stor del av saltet.`,
      _ings: canned, _mod: { saltFactor: 0.6 },
    });
  }
  const chark = ings.filter((i) => i._entry.isCharcuterie);
  if (chark.length) {
    adaptations.push({
      kind: "byt-charkuteri",
      text: `Halvera mängden ${listNames(chark)} eller byt mot färsk kyckling, fisk eller bönor i liten mängd.`,
      _ings: chark, _mod: { gramsFactor: 0.5 },
    });
  }
  const mix = ings.filter((i) => i._entry.isSpiceMix);
  if (mix.length) {
    adaptations.push({
      kind: "egen-kryddmix",
      text: "Gör din egen kryddmix av spiskummin, paprikapulver, oregano och chili utan salt i stället för färdig kryddmix.",
      _ings: mix, _mod: { saltFactor: 0.1 },
    });
  }
  const soy = ings.filter((i) => i._entry.isSoySauce);
  if (soy.length) {
    adaptations.push({
      kind: "byt-soja",
      text: "Halvera mängden soja/fisksås och välj saltreducerad, eller smaka av med lime, ingefära och vitlök i stället.",
      _ings: soy, _mod: { gramsFactor: 0.5 },
    });
  }

  const meat = ings.filter((i) => i._entry.isMeat && !i._entry.isCharcuterie);
  const meatGrams = meat.reduce((s, i) => s + i.grams, 0);
  const meatPerPortion = meatGrams / portions;

  const compute = (extra) => {
    const mods = new Map();
    for (const a of [...adaptations, ...(extra ? [extra] : [])]) {
      for (const i of a._ings) mods.set(i, { ...(mods.get(i) ?? {}), ...a._mod });
    }
    return computeNutrition(groups, portions, mods);
  };
  const meatAdaptation = (target) => ({
    kind: "minska-kott",
    text: `Minska ${listNames(meat)} till ca ${target} g per portion (ca ${Math.round(target * portions)} g totalt i stället för ${Math.round(meatGrams)} g) och fyll ut med mer grönsaker.`,
    _ings: meat, _mod: { gramsFactor: target / meatPerPortion },
  });

  let meatAdj = null;
  if (meat.length && meatPerPortion > MEAT_TRIGGER_G) meatAdj = meatAdaptation(MEAT_TARGET_PRIMARY_G);
  let adapted = compute(meatAdj);
  if (meat.length && adapted.protein > thresholds.proteinMax && meatPerPortion > MEAT_TARGET_FLOOR_G) {
    // 100 g/portion räcker inte: prova golvet 75 g/portion (vanlig nivå vid proteinreducerad kost).
    const alt = meatAdaptation(MEAT_TARGET_FLOOR_G);
    const adapted2 = compute(alt);
    if (adapted2.protein <= thresholds.proteinMax || meatAdj) {
      meatAdj = alt;
      adapted = adapted2;
    }
  }
  if (meatAdj) {
    adaptations.unshift(
      meatAdj,
      {
        kind: "mer-gronsaker",
        text: "Öka mängden grönsaker, t.ex. rotfrukter, kål eller zucchini, så att portionen mättar utan mer protein.",
        _ings: [], _mod: {},
      },
    );
  }

  // Effekt per anpassning (var för sig mot originalet)
  for (const a of adaptations) {
    const mods = new Map();
    for (const i of a._ings) mods.set(i, a._mod);
    const n = computeNutrition(groups, portions, mods);
    const effect = {};
    const dp = r1(n.protein - base.protein);
    const ds = r2(n.salt - base.salt);
    if (dp !== 0) effect.protein = dp;
    if (ds !== 0) effect.salt = ds;
    if (Object.keys(effect).length) a.effect = effect;
  }

  // Per ingrediens: hur raden ser ut i den njurvänliga versionen (appen visar den som standard).
  const NOTE = { "skolj-konserv": "sköljda", "byt-buljong": "utan salt", "egen-kryddmix": "egen blandning utan salt", "byt-soja": "saltreducerad" };
  const ingredientMods = new Map();
  for (const a of adaptations) {
    for (const i of a._ings) {
      const m = ingredientMods.get(i) ?? { factor: 1, kinds: [] };
      m.factor = Math.round(m.factor * (a._mod.gramsFactor ?? 1) * 1000) / 1000;
      m.kinds.push(a.kind);
      if (NOTE[a.kind] && !m.note) m.note = NOTE[a.kind];
      ingredientMods.set(i, m);
    }
  }
  return {
    adaptations: adaptations.map(({ _ings, _mod, ...a }) => a),
    adaptedNutrition: adaptations.length ? adapted : { ...base },
    ingredientMods,
  };
}

export function fitFor(base, adapted, thresholds = DEFAULT_THRESHOLDS) {
  if (fits(base, thresholds)) return "passar";
  if (fits(adapted, thresholds)) return "anpassa";
  return "passar-inte";
}

export function effortFor(totalMinutes, nIngredients) {
  if (totalMinutes !== undefined) {
    if (totalMinutes <= 30 && nIngredients <= 10) return "enkel";
    if (totalMinutes >= 60 || nIngredients >= 16) return "fran-grunden";
    return "medel";
  }
  if (nIngredients <= 10) return "enkel";
  if (nIngredients >= 16) return "fran-grunden";
  return "medel";
}

/** Dominant proteinkälla viktad på proteinbidrag från flaggade ingredienser. */
export function proteinSourceFor(groups) {
  const by = {};
  for (const i of flatIngredients(groups)) {
    const src = i._entry?.proteinSource;
    if (!src || !i.matched || !i._food || !i.grams) continue;
    by[src] = (by[src] ?? 0) + i.grams * (i._food.protein ?? 0) / 100;
  }
  const total = Object.values(by).reduce((s, v) => s + v, 0);
  if (!total) return "vegetariskt";
  const flesh = ["fisk", "fagel", "kott"].map((k) => [k, by[k] ?? 0]);
  const fleshTotal = flesh.reduce((s, [, v]) => s + v, 0);
  if (fleshTotal / total >= 0.4) {
    const [topKey, topVal] = flesh.sort((a, b) => b[1] - a[1])[0];
    return topVal / fleshTotal >= 0.7 ? topKey : "blandat";
  }
  return (by["agg-mejeri"] ?? 0) > (by.vegetariskt ?? 0) ? "agg-mejeri" : "vegetariskt";
}

export function mealTypeFor(categories = [], keywords = []) {
  const cats = categories.map((c) => String(c).toLowerCase());
  const has = (re) => cats.some((c) => re.test(c));
  if (has(/huvudrätt|varmrätt|middag/)) return "middag";
  if (has(/lunch/)) return "lunch";
  if (has(/frukost|brunch/)) return "frukost";
  if (has(/dessert|efterrätt/)) return "efterratt";
  if (has(/tillbehör/)) return "tillbehor";
  if (has(/förrätt|snittar|tilltugg|dryck|bakverk|godis/)) return "annat";
  const kws = keywords.map((k) => String(k).toLowerCase());
  if (kws.some((k) => /huvudrätt|middag|vardagsmat|varmrätt/.test(k))) return "middag";
  if (kws.some((k) => /lunch/.test(k))) return "lunch";
  // Kategorier saknas eller är neutrala (Fest, Buffé …). Recept som passerat scrape-filtret är varmrätter.
  return "middag";
}
