import { describe, expect, it } from "vitest";
import db from "./data/recipes.json";
import type { Recipe, RecipeDatabase } from "./types";
import {
  SNACK_RESERVE,
  dailyDinnerAllowance,
  planWeek,
  riktvarde,
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
      days: [{ dayIndex: 0, dinner: torsk.id, breakfastId: "grot", lunchId: "rester" }],
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
});
