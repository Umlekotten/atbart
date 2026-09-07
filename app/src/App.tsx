import { useEffect, useState } from "react";
import { getRecipe, recipes, thresholds } from "./recipes";
import {
  newSeed,
  planWeek,
  setDinner,
  setRestaurantDays,
  swapDinner,
  type Profile,
  type WeekPlan,
} from "./planner";
import { EMPTY_STATE, clearState, loadState, saveState, type AppState } from "./storage";
import { todayIndex } from "./format";
import { Onboarding } from "./components/Onboarding";
import { Tonight } from "./components/Tonight";
import { Week } from "./components/Week";
import { ShoppingList } from "./components/ShoppingList";
import { Restaurant } from "./components/Restaurant";
import { Recipes } from "./components/Recipes";
import { RecipeDetail } from "./components/RecipeDetail";
import { ProfileView } from "./components/Profile";
import { TabBar, type Tab } from "./components/TabBar";

type Route =
  | { name: "ikvall" }
  | { name: "veckan" }
  | { name: "inkop" }
  | { name: "restaurang"; preselect?: number; back: Route }
  | { name: "recept" }
  | { name: "recept-detalj"; id: string; back: Route; focusAdaptations?: boolean }
  | { name: "jag" };

function routeForTab(tab: Tab): Route {
  switch (tab) {
    case "ikvall":
      return { name: "ikvall" };
    case "veckan":
      return { name: "veckan" };
    case "recept":
      return { name: "recept" };
    case "jag":
      return { name: "jag" };
  }
}

function tabOf(route: Route): Tab {
  switch (route.name) {
    case "ikvall":
      return "ikvall";
    case "veckan":
    case "inkop":
      return "veckan";
    case "recept":
      return "recept";
    case "jag":
      return "jag";
    case "restaurang":
    case "recept-detalj":
      return tabOf(route.back);
  }
}

/** Planen måste ha sju dagar och bara peka på recept som finns i databasen (den kan ha bytts ut av skrapan). */
function validPlan(plan: WeekPlan | null | undefined): boolean {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7) return false;
  return plan.days.every((d) => d.restaurant || (d.dinner !== null && getRecipe(d.dinner) !== undefined));
}

function restaurantDaysOf(plan: WeekPlan): number[] {
  return plan.days.filter((d) => d.restaurant).map((d) => d.dayIndex);
}

function initialState(): AppState {
  const s = loadState();
  if (s.profile && !s.profile.dialysis && !validPlan(s.plan)) {
    const restaurantDays = s.plan?.days ? restaurantDaysOf(s.plan) : [];
    s.plan = planWeek(recipes, s.profile, { seed: s.plan?.seed ?? newSeed(), restaurantDays });
  }
  return s;
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [route, setRoute] = useState<Route>({ name: "ikvall" });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const profile = state.profile;
  const plan = state.plan;

  if (!profile || !plan) {
    return (
      <div className="app">
        <Onboarding
          onDone={(p) =>
            setState({
              ...EMPTY_STATE,
              profile: p,
              plan: planWeek(recipes, p, { seed: newSeed() }),
              tonightFilter: p.effortPref === "enkel" ? "enkla" : "alla",
            })
          }
        />
      </div>
    );
  }

  const today = todayIndex();

  function patch(fn: (s: AppState, profile: Profile, plan: WeekPlan) => Partial<AppState>) {
    setState((s) => (s.profile && s.plan ? { ...s, ...fn(s, s.profile, s.plan) } : s));
  }

  function swapDay(dayIndex: number, effort?: Profile["effortPref"]) {
    patch((_, p, pl) => ({
      plan: swapDinner(pl, dayIndex, recipes, effort ? { ...p, effortPref: effort } : p, newSeed()),
    }));
  }

  function newWeek() {
    patch((_, p, pl) => ({
      checked: {},
      plan: planWeek(recipes, p, { seed: newSeed(), restaurantDays: restaurantDaysOf(pl) }),
    }));
    setToast("Ny vecka planerad");
  }

  function removeRestaurant(dayIndex: number) {
    patch((_, p, pl) => ({
      plan: setRestaurantDays(pl, recipes, p, restaurantDaysOf(pl).filter((d) => d !== dayIndex)),
    }));
  }

  function addTonight(id: string) {
    patch((_, __, pl) => ({ plan: setDinner(pl, today, id) }));
    setRoute({ name: "ikvall" });
    setToast("Inlagd som middag i kväll");
  }

  function saveProfile(p: Profile) {
    patch((_, __, pl) => ({
      profile: p,
      plan: planWeek(recipes, p, { seed: pl.seed, restaurantDays: restaurantDaysOf(pl) }),
      tonightFilter: p.effortPref === "enkel" ? "enkla" : "alla",
    }));
    setToast("Sparat, veckan är omräknad");
  }

  function reset() {
    clearState();
    setState(EMPTY_STATE);
    setRoute({ name: "ikvall" });
  }

  function openRecipe(id: string, focusAdaptations?: boolean) {
    setRoute({ name: "recept-detalj", id, back: route, focusAdaptations });
  }

  let screen: JSX.Element;
  switch (route.name) {
    case "ikvall":
      screen = (
        <Tonight
          plan={plan}
          profile={profile}
          recipes={recipes}
          getRecipe={getRecipe}
          filter={state.tonightFilter}
          onFilter={(f) => setState((s) => ({ ...s, tonightFilter: f }))}
          onSwap={() => swapDay(today, state.tonightFilter === "enkla" ? "enkel" : "alla")}
          onOpenRecipe={openRecipe}
          onOpenRestaurant={() => setRoute({ name: "restaurang", back: route })}
        />
      );
      break;
    case "veckan":
      screen = (
        <Week
          plan={plan}
          profile={profile}
          recipes={recipes}
          getRecipe={getRecipe}
          onSwap={(d) => swapDay(d)}
          onOpenRecipe={(id) => openRecipe(id)}
          onEatOut={(d) => setRoute({ name: "restaurang", preselect: d, back: route })}
          onRemoveRestaurant={removeRestaurant}
          onNewWeek={newWeek}
          onShopping={() => setRoute({ name: "inkop" })}
        />
      );
      break;
    case "inkop":
      screen = (
        <ShoppingList
          plan={plan}
          recipes={recipes}
          portions={profile.portions}
          checked={state.checked}
          onToggle={(key) =>
            setState((s) => ({ ...s, checked: { ...s.checked, [key]: !s.checked[key] } }))
          }
          onClearChecked={() => setState((s) => ({ ...s, checked: {} }))}
          onBack={() => setRoute({ name: "veckan" })}
        />
      );
      break;
    case "restaurang": {
      const back = route.back;
      screen = (
        <Restaurant
          plan={plan}
          profile={profile}
          recipes={recipes}
          getRecipe={getRecipe}
          preselect={route.preselect}
          onApply={(p) => {
            setState((s) => ({ ...s, plan: p, checked: {} }));
            setRoute(back);
            setToast("Veckan är omräknad");
          }}
          onBack={() => setRoute(back)}
        />
      );
      break;
    }
    case "recept":
      screen = <Recipes recipes={recipes} onOpen={(id) => openRecipe(id)} />;
      break;
    case "recept-detalj": {
      const recipe = getRecipe(route.id);
      const back = route.back;
      screen = recipe ? (
        <RecipeDetail
          recipe={recipe}
          profile={profile}
          thresholds={thresholds}
          onBack={() => setRoute(back)}
          onAddTonight={addTonight}
          focusAdaptations={route.focusAdaptations}
        />
      ) : (
        <div className="screen">
          <p>Receptet hittades inte.</p>
        </div>
      );
      break;
    }
    case "jag":
      screen = <ProfileView profile={profile} onSave={saveProfile} onReset={reset} />;
      break;
  }

  const tab = tabOf(route);

  return (
    <div className="app">
      {screen}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      <TabBar
        active={tab}
        onChange={(t) => setRoute(routeForTab(t))}
      />
    </div>
  );
}
