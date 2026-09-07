import { useMemo, useState } from "react";
import type { Recipe } from "../types";
import {
  COMPENSATION_DAYS,
  RESTAURANT_ESTIMATE,
  setRestaurantDays,
  weekTotals,
  type Profile,
  type WeekPlan,
} from "../planner";
import { WEEKDAYS, WEEKDAYS_SHORT, caProtein, caSalt, dateForDayIndex, shortDate, sv } from "../format";
import { Bar, Button, ForkKnife, ScreenHeader } from "./ui";

function sameSet(a: number[], b: number[]): boolean {
  const x = [...a].sort().join(",");
  const y = [...b].sort().join(",");
  return x === y;
}

function joinSv(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Restaurant({
  plan,
  profile,
  recipes,
  getRecipe,
  preselect,
  onApply,
  onBack,
}: {
  plan: WeekPlan;
  profile: Profile;
  recipes: Recipe[];
  getRecipe: (id: string | null) => Recipe | undefined;
  preselect?: number;
  onApply: (plan: WeekPlan) => void;
  onBack: () => void;
}) {
  const initial = useMemo(() => plan.days.filter((d) => d.restaurant).map((d) => d.dayIndex), [plan]);
  const [draftDays, setDraftDays] = useState<number[]>(() =>
    preselect !== undefined && !initial.includes(preselect) ? [...initial, preselect] : initial
  );

  const draft = useMemo(
    () => setRestaurantDays(plan, recipes, profile, draftDays),
    [plan, recipes, profile, draftDays]
  );
  const before = useMemo(() => weekTotals(plan, recipes, profile), [plan, recipes, profile]);
  const after = useMemo(() => weekTotals(draft, recipes, profile), [draft, recipes, profile]);

  const changed = !sameSet(draftDays, initial);
  const added = draftDays.filter((d) => !initial.includes(d));
  const removed = initial.filter((d) => !draftDays.includes(d));

  function toggle(d: number) {
    setDraftDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  function dinnerProtein(p: WeekPlan, d: number): number {
    const day = p.days[d];
    if (day.restaurant) return RESTAURANT_ESTIMATE.protein;
    return getRecipe(day.dinner)?.adaptedNutrition.protein ?? 0;
  }

  /** Middagen byttes mot en med mindre protein. */
  function isLighter(d: number): boolean {
    if (draft.days[d].restaurant) return false;
    if (draft.days[d].dinner === plan.days[d].dinner) return false;
    return dinnerProtein(draft, d) < dinnerProtein(plan, d) - 1e-6;
  }

  /** Dagar vars middag byttes till något lättare på grund av en ny restaurangkväll. */
  function lighterAround(restaurantDay: number): number[] {
    const out: number[] = [];
    for (let d = restaurantDay - COMPENSATION_DAYS; d <= restaurantDay + COMPENSATION_DAYS; d++) {
      if (d < 0 || d > 6 || d === restaurantDay) continue;
      if (isLighter(d)) out.push(d);
    }
    return out;
  }

  const sentences: string[] = [];
  for (const d of added) {
    const lighter = lighterAround(d).map((i) => WEEKDAYS[i].toLowerCase());
    let s = `På ${WEEKDAYS[d].toLowerCase()} äter du ute. Vi räknar med ${caProtein(RESTAURANT_ESTIMATE.protein)} och ${caSalt(RESTAURANT_ESTIMATE.salt)} för kvällen, så du behöver inte tänka på det.`;
    if (lighter.length > 0) {
      s += ` ${capitalize(joinSv(lighter))} får ${lighter.length === 1 ? "en lättare middag" : "lättare middagar"} så att veckan jämnar ut sig.`;
    } else {
      s += " Dagarna runt om ligger redan lätt, så veckan landar ändå.";
    }
    sentences.push(s);
  }
  for (const d of removed) {
    sentences.push(`${WEEKDAYS[d]} blir en vanlig middagskväll igen, och dagarna runt om planeras om.`);
  }

  const maxDay = Math.max(profile.proteinTarget * 1.3, ...before.perDay.map((d) => d.protein), ...after.perDay.map((d) => d.protein));

  return (
    <div className="screen">
      <ScreenHeader title="Äta ute" subtitle="Välj dag. Du njuter, vi jämnar ut veckan hemma." onBack={onBack} />

      <div className="day-picker" role="group" aria-label="Välj dagar du äter ute">
        {WEEKDAYS_SHORT.map((label, d) => {
          const on = draftDays.includes(d);
          return (
            <button
              key={d}
              type="button"
              className={`day-pick${on ? " day-pick-on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(d)}
            >
              <span className="day-pick-name">{label}</span>
              <span className="day-pick-date">{shortDate(dateForDayIndex(d))}</span>
              <span className="day-pick-icon">{on ? <ForkKnife size={16} /> : null}</span>
            </button>
          );
        })}
      </div>

      <section className="card impact-card">
        <div className="impact-head">
          <h2>Så påverkas veckan</h2>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-swatch legend-before" /> Före
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-after" /> Efter
            </span>
          </div>
        </div>

        <ul className="impact-list">
          {plan.days.map((_, i) => {
            const b = before.perDay[i];
            const a = after.perDay[i];
            const isOut = draft.days[i].restaurant;
            const wasOut = plan.days[i].restaurant;
            const dinnerChanged = draft.days[i].dinner !== plan.days[i].dinner || isOut !== wasOut;
            const tag = isOut ? "ute" : isLighter(i) ? "lättare" : dinnerChanged ? "ny rätt" : null;
            const afterRecipe = getRecipe(draft.days[i].dinner);
            return (
              <li key={i} className={`impact-row${dinnerChanged ? " impact-row-changed" : ""}`}>
                <div className="impact-day">
                  <span className="day-name">{WEEKDAYS_SHORT[i]}</span>
                  {tag ? <span className={`tag tag-${tag === "ute" ? "out" : "light"}`}>{tag}</span> : null}
                </div>
                <div className="impact-bars">
                  <Bar thin value={b.protein} max={maxDay} tone="muted" label={`Före ${WEEKDAYS[i]}`} />
                  <Bar thin value={a.protein} max={maxDay} tone={isOut ? "adapt" : "primary"} label={`Efter ${WEEKDAYS[i]}`} />
                  <span className="impact-recipe muted small">
                    {isOut ? "Äter ute" : afterRecipe?.name ?? "—"}
                  </span>
                </div>
                <div className="impact-nums">
                  <span className="muted">{sv(b.protein)}</span>
                  <span className="impact-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className={dinnerChanged ? "impact-after" : ""}>{sv(a.protein)} g</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Gram protein per dag, alla måltider inräknade. Ditt dagsmål är {profile.proteinTarget} g.</p>
      </section>

      <section className="card totals-card">
        <h2>Hela veckan</h2>
        <div className="totals-grid">
          <div className="totals-col">
            <span className="totals-label muted">Före</span>
            <span className="totals-num">ca {sv(before.protein)} g</span>
            <span className="totals-sub muted small">protein av {sv(before.budget.protein)} g</span>
            <span className="totals-num">ca {sv(before.salt, 1)} g</span>
            <span className="totals-sub muted small">salt av {sv(before.budget.salt)} g</span>
          </div>
          <div className="totals-arrow" aria-hidden="true">
            →
          </div>
          <div className="totals-col totals-after">
            <span className="totals-label">Efter</span>
            <span className="totals-num">ca {sv(after.protein)} g</span>
            <span className="totals-sub muted small">protein av {sv(after.budget.protein)} g</span>
            <span className="totals-num">ca {sv(after.salt, 1)} g</span>
            <span className="totals-sub muted small">salt av {sv(after.budget.salt)} g</span>
          </div>
        </div>
        <div className="totals-bars">
          <Bar value={after.protein} max={after.budget.protein} label="Protein hela veckan efter" />
          <Bar value={after.salt} max={after.budget.salt} label="Salt hela veckan efter" />
        </div>
        {after.protein > after.budget.protein || after.salt > after.budget.salt ? (
          <p className="soft-warning">Veckan skulle landa lite över. Det går, men byt gärna någon middag mot en lättare.</p>
        ) : (
          <p className="ok-text">Veckan landar inom ditt mål.</p>
        )}
      </section>

      {sentences.length > 0 ? (
        <section className="card explain-card">
          {sentences.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </section>
      ) : (
        <section className="card explain-card">
          <p className="muted">
            {draftDays.length > 0
              ? "Tryck på en dag för att lägga till eller ta bort en kväll du äter ute."
              : "Välj en dag ovan. Vi räknar med en vanlig restaurangmåltid och gör dagarna runt om lite lättare. Du behöver inte räkna själv."}
          </p>
        </section>
      )}

      <div className="btn-row btn-row-stack">
        <Button full disabled={!changed} onClick={() => onApply(draft)}>
          Använd den här veckan
        </Button>
        <Button full variant="ghost" onClick={onBack}>
          Avbryt
        </Button>
      </div>
    </div>
  );
}
