import type { Recipe } from "../types";
import { shoppingList, type WeekPlan } from "../planner";
import { Button, Check, ScreenHeader } from "./ui";

export function ShoppingList({
  plan,
  recipes,
  portions,
  checked,
  onToggle,
  onClearChecked,
  onBack,
}: {
  plan: WeekPlan;
  recipes: Recipe[];
  portions: number;
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
  onClearChecked: () => void;
  onBack: () => void;
}) {
  const groups = shoppingList(plan, recipes, portions);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const done = groups.reduce((s, g) => s + g.items.filter((i) => checked[i.key]).length, 0);
  const dinnerCount = plan.days.filter((d) => d.dinner).length;

  return (
    <div className="screen">
      <ScreenHeader
        title="Inköpslista"
        subtitle={`För ${portions} ${portions === 1 ? "portion" : "portioner"} · ${dinnerCount} middagar · ${done} av ${total} avbockade`}
        onBack={onBack}
        action={
          done > 0 ? (
            <Button variant="ghost" small onClick={onClearChecked}>
              Rensa
            </Button>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <section className="card">
          <p className="muted">Inga middagar att handla för den här veckan.</p>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.category} className="shop-group">
          <h2 className="shop-title">{group.label}</h2>
          <ul className="shop-list">
            {group.items.map((item) => {
              const isChecked = !!checked[item.key];
              return (
                <li key={item.key}>
                  <label className={`shop-row${isChecked ? " shop-row-done" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(item.key)}
                      aria-label={`${item.name} ${item.amount}`}
                    />
                    <span className="shop-box" aria-hidden="true">
                      {isChecked ? <Check /> : null}
                    </span>
                    <span className="shop-name">{item.name}</span>
                    <span className="shop-amount">{item.amount}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="muted small center">
        Mängderna är skalade efter dina portioner och ungefärliga. Salt står med där receptet har det, men du vet ju hur
        det är med saltet.
      </p>
    </div>
  );
}
