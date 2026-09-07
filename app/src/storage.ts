import type { Profile, WeekPlan } from "./planner";

export const STORAGE_KEY = "vfn-state-v1";

export interface AppState {
  profile: Profile | null;
  plan: WeekPlan | null;
  /** Avbockade rader i inköpslistan, nyckel = ShoppingItem.key */
  checked: Record<string, boolean>;
  /** Filterchip på "I kväll" */
  tonightFilter: "alla" | "enkla";
}

export const EMPTY_STATE: AppState = {
  profile: null,
  plan: null,
  checked: {},
  tonightFilter: "alla",
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage kan vara avstängt; appen fungerar ändå under sessionen.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorera
  }
}
