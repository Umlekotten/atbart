/**
 * Enkla standardmåltider för frukost och lunch.
 * Siffrorna är hackathon-antaganden per portion och ska godkännas av dietist.
 */

export interface StandardMeal {
  id: string;
  name: string;
  /** g protein per portion */
  protein: number;
  /** g salt per portion */
  salt: number;
  energyKcal: number;
  /**
   * Om true används gårdagens middag (adaptedNutrition) i stället för siffrorna här.
   * Siffrorna här blir då reservvärden när det inte finns någon gårdagsmiddag.
   */
  usesLeftovers?: boolean;
}

export const BREAKFASTS: StandardMeal[] = [
  { id: "grot", name: "Havregrynsgröt med äpple och kanel", protein: 6, salt: 0.1, energyKcal: 320 },
  { id: "fil-musli", name: "Fil med müsli och bär", protein: 8, salt: 0.3, energyKcal: 340 },
  { id: "smorgas-agg", name: "Smörgås med ägg och gurka", protein: 10, salt: 0.9, energyKcal: 300 },
  { id: "smoothie", name: "Smoothie med banan och havre", protein: 5, salt: 0.1, energyKcal: 280 },
];

export const LUNCHES: StandardMeal[] = [
  {
    id: "rester",
    name: "Rester från gårdagens middag",
    protein: 15,
    salt: 0.8,
    energyKcal: 450,
    usesLeftovers: true,
  },
  { id: "sallad-kikarter", name: "Sallad med kikärter och citron", protein: 12, salt: 0.6, energyKcal: 420 },
  { id: "gronsakssoppa", name: "Grönsakssoppa med bröd", protein: 9, salt: 1.0, energyKcal: 380 },
  { id: "pasta-tomatsas", name: "Pasta med tomatsås", protein: 12, salt: 0.8, energyKcal: 470 },
];

export const DEFAULT_BREAKFAST_ID = "grot";
export const DEFAULT_LUNCH_ID = "rester";

export function findBreakfast(id: string): StandardMeal {
  return BREAKFASTS.find((m) => m.id === id) ?? BREAKFASTS[0];
}

export function findLunch(id: string): StandardMeal {
  return LUNCHES.find((m) => m.id === id) ?? LUNCHES[0];
}
