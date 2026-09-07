import { describe, expect, it } from "vitest";
import db from "./data/recipes.json";
import type { Recipe, RecipeDatabase } from "./types";
import {
  COMPENSATION_DAYS,
  DAY_FLOOR,
  RESTAURANT_ESTIMATE,
  SNACK_RESERVE,
  dailyDinnerAllowance,
  dayTotals,
  planWeek,
  riktvarde,
  setRestaurantDays,
  shoppingList,
  swapDinner,
  weekTotals,
  type Profile,
} from "./planner";

const recipes = (db as RecipeDatabase).recipes as Recipe[];

const demo: Profile = {
  weightKg: 68,
  proteinTarget: 55,
  saltTarget: 5,
  targetSource: "dietist",
  dialysis: false,
  portions: 1,
  effortPref: "alla",
};

describe("dagsutrymme", () => {
  it("räknar middagens utrymme som mål − frukost − lunch − mellanmålsreserv", () => {
    const breakfast = { protein: 6, salt: 0.1, energyKcal: 320 };
    const lunch = { protein: 15, salt: 0.8, energyKcal: 450 };
    const a = dailyDinnerAllowance(demo, breakfast, lunch);
    expect(a.protein).toBeCloseTo(55 - 6 - 15 - SNACK_RESERVE.protein);
    expect(a.salt).toBeCloseTo(5 - 0.1 - 0.8 - SNACK_RESERVE.salt);
  });

  it("riktvärdet är 0,8 g/kg och 5 g salt", () => {
    expect(riktvarde(68)).toEqual({ protein: 54, salt: 5 });
    expect(riktvarde(80)).toEqual({ protein: 64, salt: 5 });
  });
});

describe("planWeek", () => {
  it("ger sju dagar med middag och håller sig inom veckobudgeten", () => {
    const plan = planWeek(recipes, demo, { seed: 42 });
    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.restaurant).toBe(false);
      expect(day.dinner).not.toBeNull();
    }
    const totals = weekTotals(plan, recipes, demo);
    expect(totals.protein).toBeLessThanOrEqual(totals.budget.protein);
    expect(totals.salt).toBeLessThanOrEqual(totals.budget.salt);
  });

  it("upprepar aldrig ett recept under veckan", () => {
    for (const seed of [1, 7, 99, 2024]) {
      const plan = planWeek(recipes, demo, { seed });
      const ids = plan.days.map((d) => d.dinner).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("planerar bara in recept som passar eller kan anpassas", () => {
    const plan = planWeek(recipes, demo, { seed: 5 });
    const byId = new Map(recipes.map((r) => [r.id, r]));
    for (const day of plan.days) {
      const r = byId.get(day.dinner!)!;
      expect(["passar", "anpassa"]).toContain(r.fit);
    }
  });

  it("har högst två köttmiddagar och undviker samma proteinkälla två dagar i rad", () => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    for (const seed of [3, 11, 500]) {
      const plan = planWeek(recipes, demo, { seed });
      const sources = plan.days.map((d) => byId.get(d.dinner!)!.proteinSource);
      expect(sources.filter((s) => s === "kott").length).toBeLessThanOrEqual(2);
      for (let i = 1; i < sources.length; i++) {
        expect(sources[i]).not.toBe(sources[i - 1]);
      }
    }
  });

  it("är deterministisk för samma seed och annorlunda för ett nytt", () => {
    const a = planWeek(recipes, demo, { seed: 123 });
    const b = planWeek(recipes, demo, { seed: 123 });
    const c = planWeek(recipes, demo, { seed: 124 });
    expect(a.days.map((d) => d.dinner)).toEqual(b.days.map((d) => d.dinner));
    expect(a.days.map((d) => d.dinner)).not.toEqual(c.days.map((d) => d.dinner));
  });

  it("vägrar planera för dialys", () => {
    expect(() => planWeek(recipes, { ...demo, dialysis: true }, { seed: 1 })).toThrow(/dialys/i);
  });

  it("respekterar 'bara enkla' när det finns tillräckligt många enkla recept", () => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const plan = planWeek(recipes, { ...demo, effortPref: "enkel" }, { seed: 9 });
    for (const day of plan.days) {
      // Exempeldatan har färre än nio enkla, så vi faller tillbaka till medel men aldrig "från grunden".
      expect(byId.get(day.dinner!)!.effort).not.toBe("fran-grunden");
    }
  });
});

describe("restaurangkväll", () => {
  it("reserverar restauranguppskattningen och ger grannarna lättare middagar", () => {
    const seed = 42;
    const before = planWeek(recipes, demo, { seed });
    const after = setRestaurantDays(before, recipes, demo, [3]);

    expect(after.days[3].restaurant).toBe(true);
    expect(after.days[3].dinner).toBeNull();
    const day3 = dayTotals(after, 3, recipes, demo);
    expect(day3.dinner).toEqual(RESTAURANT_ESTIMATE);

    const byId = new Map(recipes.map((r) => [r.id, r]));
    const dinnerProtein = (plan: typeof before, i: number) => byId.get(plan.days[i].dinner!)!.adaptedNutrition.protein;

    // Grannarna inom kompensationsfönstret ska i snitt vara lättare än de var före.
    const neighbours = [3 - COMPENSATION_DAYS, 3 - 1, 3 + 1, 3 + COMPENSATION_DAYS];
    const avg = (plan: typeof before) => neighbours.reduce((s, i) => s + dinnerProtein(plan, i), 0) / neighbours.length;
    expect(avg(after)).toBeLessThanOrEqual(avg(before));

    // En granne blir aldrig tyngre än den var (samma mått som planeraren: protein väger tyngst, salt hälften).
    const lightness = (r: Recipe) => r.adaptedNutrition.protein / demo.proteinTarget + 0.5 * (r.adaptedNutrition.salt / demo.saltTarget);
    for (const i of neighbours) {
      const b = byId.get(before.days[i].dinner!)!;
      const a = byId.get(after.days[i].dinner!)!;
      expect(lightness(a)).toBeLessThanOrEqual(lightness(b) + 1e-9);
    }

    // Byts en grannes middag ut, håller den nya dagen golvet.
    for (const i of neighbours) {
      if (after.days[i].dinner === before.days[i].dinner) continue;
      const t = dayTotals(after, i, recipes, demo);
      expect(t.protein).toBeGreaterThanOrEqual(DAY_FLOOR * demo.proteinTarget - 1e-6);
    }

    // Dagar utanför fönstret behålls.
    expect(after.days[0].dinner).toBe(before.days[0].dinner);
    expect(after.days[6].dinner).toBe(before.days[6].dinner);

    // Veckan håller fortfarande budgeten.
    const totals = weekTotals(after, recipes, demo);
    expect(totals.protein).toBeLessThanOrEqual(totals.budget.protein);
    expect(totals.salt).toBeLessThanOrEqual(totals.budget.salt);
  });

  it("räknar med restauranguppskattningen i veckototalen", () => {
    const plain = planWeek(recipes, demo, { seed: 8 });
    const withOut = planWeek(recipes, demo, { seed: 8, restaurantDays: [1, 4] });
    const t = weekTotals(withOut, recipes, demo);
    const restaurantProtein = t.perDay.filter((_, i) => [1, 4].includes(i)).reduce((s, d) => s + d.dinner.protein, 0);
    expect(restaurantProtein).toBe(2 * RESTAURANT_ESTIMATE.protein);
    expect(plain.days.filter((d) => d.restaurant)).toHaveLength(0);
  });
});

describe("swapDinner", () => {
  it("byter till ett annat recept som inte redan finns i veckan", () => {
    const plan = planWeek(recipes, demo, { seed: 42 });
    const swapped = swapDinner(plan, 2, recipes, demo, 77);
    expect(swapped.days[2].dinner).not.toBe(plan.days[2].dinner);
    const others = plan.days.filter((_, i) => i !== 2).map((d) => d.dinner);
    expect(others).not.toContain(swapped.days[2].dinner);
    // Övriga dagar orörda
    plan.days.forEach((d, i) => {
      if (i !== 2) expect(swapped.days[i].dinner).toBe(d.dinner);
    });
  });
});

describe("shoppingList", () => {
  it("slår ihop dubbletter, skalar efter portioner och använder den njurvänliga versionen", () => {
    // Torskreceptet från köket.se: 600 g torskrygg, smör 50 + 50 + 100 g, 800 g potatis, salt x2 + flingsalt, 4 portioner.
    const torsk = recipes.find((r) => r.id === "torsk-med-brynt-kapris-och-citronsmor")!;
    expect(torsk).toBeDefined();
    const plan = {
      seed: 1,
      days: [{ dayIndex: 0, dinner: torsk.id, restaurant: false, breakfastId: "grot", lunchId: "rester" }],
    };
    const list = shoppingList(plan, recipes, 2);
    const all = list.flatMap((g) => g.items);

    // Smör förekommer tre gånger → en rad, 200 g × 2/4 = ca 100 g (smör påverkas inte av någon anpassning)
    const smor = all.filter((i) => i.name.toLowerCase() === "smör");
    expect(smor).toHaveLength(1);
    expect(smor[0].amount).toBe("ca 100 g");

    // Potatis 800 g × 0,5 = 400 g
    const potatis = all.filter((i) => /potatis/.test(i.name.toLowerCase()));
    const totalPotatis = potatis.reduce((s, i) => s + Number((i.amount.match(/[0-9]+/) ?? ["0"])[0]), 0);
    expect(totalPotatis).toBe(400);

    // Den njurvänliga versionen: torsken är minskad (600 g × faktor) och saltet borttaget
    const fiskIng = torsk.ingredientGroups.flatMap((g) => g.ingredients).find((i) => i.name === "torskrygg")!;
    expect(fiskIng.adapted?.factor ?? 1).toBeLessThan(1);
    const expectedTorsk = Math.round(600 * (fiskIng.adapted?.factor ?? 1) * 0.5);
    const fisk = list.find((g) => g.category === "fisk-skaldjur")!;
    expect(fisk.label).toBe("Fisk & skaldjur");
    expect(fisk.items.find((i) => i.name === "torskrygg")!.amount).toBe(`ca ${expectedTorsk} g`);
    expect(all.some((i) => /^(fling)?salt$/.test(i.name.toLowerCase()))).toBe(false);
  });

  it("hoppar över restaurangdagar", () => {
    const plan = planWeek(recipes, demo, { seed: 2, restaurantDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(shoppingList(plan, recipes, 1)).toEqual([]);
  });
});
