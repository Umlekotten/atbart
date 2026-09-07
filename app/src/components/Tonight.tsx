import type { Recipe } from "../types";
import {
  RESTAURANT_ESTIMATE,
  weekTotals,
  type Profile,
  type WeekPlan,
} from "../planner";
import { WEEKDAYS, caProtein, caSalt, longDate, nutritionLine, sv, todayIndex, EFFORT_LABEL, PROTEIN_SOURCE_LABEL } from "../format";
import { Bar, Button, Chip, FitBadge, ForkKnife, RecipeImage, ofBudget } from "./ui";

export function Tonight({
  plan,
  profile,
  recipes,
  getRecipe,
  filter,
  onFilter,
  onSwap,
  onOpenRecipe,
  onOpenRestaurant,
}: {
  plan: WeekPlan;
  profile: Profile;
  recipes: Recipe[];
  getRecipe: (id: string | null) => Recipe | undefined;
  filter: "alla" | "enkla";
  onFilter: (f: "alla" | "enkla") => void;
  onSwap: () => void;
  onOpenRecipe: (id: string, showAdaptations?: boolean) => void;
  onOpenRestaurant: () => void;
}) {
  const today = todayIndex();
  const day = plan.days[today];
  const recipe = getRecipe(day.dinner);
  const totals = weekTotals(plan, recipes, profile);
  const overProtein = totals.protein > totals.budget.protein + 1e-6;
  const overSalt = totals.salt > totals.budget.salt + 1e-6;

  return (
    <div className="screen">
      <header className="home-header">
        <p className="eyebrow">{WEEKDAYS[today]}</p>
        <h1>I kväll</h1>
        <p className="muted">{longDate()}</p>
      </header>

      {day.restaurant ? (
        <section className="card dinner-card dinner-out">
          <div className="dinner-out-icon">
            <ForkKnife size={28} />
          </div>
          <h2>I kväll äter du ute</h2>
          <p>
            Njut av kvällen och ät det du blir bjuden på. Vi har räknat med {caProtein(RESTAURANT_ESTIMATE.protein)} och{" "}
            {caSalt(RESTAURANT_ESTIMATE.salt)}, och dagarna runt om har fått lite lättare middagar. Veckan landar ändå.
          </p>
          <div className="btn-row">
            <Button variant="secondary" full onClick={onOpenRestaurant}>
              Ändra
            </Button>
          </div>
        </section>
      ) : recipe ? (
        <section className="card dinner-card">
          <RecipeImage recipe={recipe} size="card" />
          <div className="dinner-body">
            <div className="dinner-meta">
              <FitBadge
                fit={recipe.fit}
                onClick={recipe.fit === "anpassa" ? () => onOpenRecipe(recipe.id, true) : undefined}
              />
              <span className="muted small">
                {PROTEIN_SOURCE_LABEL[recipe.proteinSource]}
                {recipe.totalMinutes ? ` · ${recipe.totalMinutes} min` : ""}
                {` · ${EFFORT_LABEL[recipe.effort]}`}
              </span>
            </div>
            <h2 className="dinner-name">{recipe.name}</h2>
            <p className="dinner-nutrition">{nutritionLine(recipe.adaptedNutrition)}</p>
            <div className="chip-row chip-row-tight">
              <Chip active={filter === "alla"} onClick={() => onFilter("alla")}>
                Alla
              </Chip>
              <Chip active={filter === "enkla"} onClick={() => onFilter("enkla")}>
                Enkla
              </Chip>
            </div>
            <div className="btn-row">
              <Button variant="secondary" full onClick={onSwap}>
                Byt rätt
              </Button>
              <Button full onClick={() => onOpenRecipe(recipe.id)}>
                Öppna receptet
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="card dinner-card">
          <div className="dinner-body">
            <h2 className="dinner-name">Ingen middag vald</h2>
            <p className="muted">Tryck på Byt rätt så hittar vi något som passar i kväll.</p>
            <div className="btn-row">
              <Button full onClick={onSwap}>
                Byt rätt
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="card budget-card">
        <div className="budget-head">
          <h2>Kvar i veckan</h2>
          <span className="muted small">planerat mot 7 dagars mål</span>
        </div>
        <div className="budget-row">
          <div className="budget-label">
            <span>Protein</span>
            <span className="muted">{ofBudget(totals.protein, totals.budget.protein)}</span>
          </div>
          <Bar value={totals.protein} max={totals.budget.protein} label="Protein den här veckan" />
          <p className="budget-left">
            {overProtein
              ? `ca ${sv(totals.protein - totals.budget.protein)} g över`
              : `ca ${sv(totals.budget.protein - totals.protein)} g kvar`}
          </p>
        </div>
        <div className="budget-row">
          <div className="budget-label">
            <span>Salt</span>
            <span className="muted">{ofBudget(totals.salt, totals.budget.salt, "g", 1)}</span>
          </div>
          <Bar value={totals.salt} max={totals.budget.salt} label="Salt den här veckan" />
          <p className="budget-left">
            {overSalt
              ? `ca ${sv(totals.salt - totals.budget.salt, 1)} g över`
              : `ca ${sv(totals.budget.salt - totals.salt, 1)} g kvar`}
          </p>
        </div>
        {overProtein || overSalt ? (
          <p className="soft-warning">
            Veckan ligger lite över just nu. Byt en middag mot något lättare, så landar det.
          </p>
        ) : (
          <p className="muted small">Frukost, lunch och lite mellanmål är inräknade. Middagarna räknas med sina anpassningar.</p>
        )}
      </section>
    </div>
  );
}
