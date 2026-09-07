import { useState } from "react";
import type { Recipe } from "../types";
import { RESTAURANT_ESTIMATE, weekTotals, type Profile, type WeekPlan } from "../planner";
import { WEEKDAYS, WEEKDAYS_SHORT, dateForDayIndex, nutritionLine, shortDate, sv, todayIndex } from "../format";
import { Bar, Button, ChevronRight, ForkKnife, ScreenHeader, Sheet, ofBudget } from "./ui";

export function Week({
  plan,
  profile,
  recipes,
  getRecipe,
  onSwap,
  onOpenRecipe,
  onEatOut,
  onRemoveRestaurant,
  onNewWeek,
  onShopping,
}: {
  plan: WeekPlan;
  profile: Profile;
  recipes: Recipe[];
  getRecipe: (id: string | null) => Recipe | undefined;
  onSwap: (dayIndex: number) => void;
  onOpenRecipe: (id: string) => void;
  onEatOut: (dayIndex: number) => void;
  onRemoveRestaurant: (dayIndex: number) => void;
  onNewWeek: () => void;
  onShopping: () => void;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const totals = weekTotals(plan, recipes, profile);
  const today = todayIndex();
  const sheetDay = openDay !== null ? plan.days[openDay] : null;
  const sheetRecipe = sheetDay ? getRecipe(sheetDay.dinner) : undefined;

  return (
    <div className="screen">
      <ScreenHeader
        title="Veckan"
        subtitle={`${ofBudget(totals.protein, totals.budget.protein)} protein · ${ofBudget(totals.salt, totals.budget.salt, "g", 1)} salt`}
      />
      <div className="btn-row">
        <Button variant="secondary" full onClick={onNewWeek}>
          Ny vecka
        </Button>
        <Button full onClick={onShopping}>
          Inköpslista
        </Button>
      </div>

      <ul className="day-list">
        {plan.days.map((day, i) => {
          const r = getRecipe(day.dinner);
          const t = totals.perDay[i];
          return (
            <li key={day.dayIndex}>
              <button
                type="button"
                className={`day-row${day.restaurant ? " day-row-out" : ""}${i === today ? " day-row-today" : ""}`}
                onClick={() => setOpenDay(i)}
              >
                <div className="day-col">
                  <span className="day-name">{WEEKDAYS_SHORT[i]}</span>
                  <span className="day-date">{shortDate(dateForDayIndex(i))}</span>
                </div>
                <div className="day-main">
                  <span className="day-title">
                    {day.restaurant ? (
                      <>
                        <span className="day-out-icon">
                          <ForkKnife size={15} />
                        </span>
                        Äter ute
                      </>
                    ) : (
                      r?.name ?? "Ingen middag vald"
                    )}
                  </span>
                  <span className="muted small">
                    {day.restaurant
                      ? `reserverat ${nutritionLine(RESTAURANT_ESTIMATE)}`
                      : r
                        ? nutritionLine(r.adaptedNutrition)
                        : "tryck för att välja"}
                  </span>
                  <div className="day-bars">
                    <div className="day-bar-row">
                      <span className="day-bar-label">Protein</span>
                      <Bar thin value={t.protein} max={t.target.protein} tone={day.restaurant ? "adapt" : "primary"} label={`Protein ${WEEKDAYS[i]}`} />
                      <span className="day-bar-num">{sv(t.protein)} g</span>
                    </div>
                    <div className="day-bar-row">
                      <span className="day-bar-label">Salt</span>
                      <Bar thin value={t.salt} max={t.target.salt} tone={day.restaurant ? "adapt" : "primary"} label={`Salt ${WEEKDAYS[i]}`} />
                      <span className="day-bar-num">{sv(t.salt, 1)} g</span>
                    </div>
                  </div>
                </div>
                <span className="day-chevron">
                  <ChevronRight />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small center">Staplarna visar dagens protein och salt mot ditt dagsmål, alla måltider inräknade.</p>

      <Sheet
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={openDay !== null ? `${WEEKDAYS[openDay]} ${shortDate(dateForDayIndex(openDay))}` : undefined}
      >
        {sheetDay && openDay !== null ? (
          <div className="sheet-body">
            {sheetDay.restaurant ? (
              <p className="sheet-recipe">
                <span className="day-out-icon">
                  <ForkKnife size={16} />
                </span>{" "}
                Äter ute
                <br />
                <span className="muted small">reserverat {nutritionLine(RESTAURANT_ESTIMATE)}</span>
              </p>
            ) : sheetRecipe ? (
              <p className="sheet-recipe">
                {sheetRecipe.name}
                <br />
                <span className="muted small">{nutritionLine(sheetRecipe.adaptedNutrition)}</span>
              </p>
            ) : null}

            {!sheetDay.restaurant ? (
              <Button variant="secondary" full onClick={() => onSwap(openDay)}>
                Byt rätt
              </Button>
            ) : null}
            {sheetRecipe && !sheetDay.restaurant ? (
              <Button variant="secondary" full onClick={() => onOpenRecipe(sheetRecipe.id)}>
                Öppna receptet
              </Button>
            ) : null}
            {sheetDay.restaurant ? (
              <Button
                full
                onClick={() => {
                  onRemoveRestaurant(openDay);
                  setOpenDay(null);
                }}
              >
                Jag äter hemma den här dagen
              </Button>
            ) : (
              <Button
                full
                onClick={() => {
                  setOpenDay(null);
                  onEatOut(openDay);
                }}
              >
                Jag äter ute den här dagen
              </Button>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
