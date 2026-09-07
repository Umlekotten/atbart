import { useEffect, useState } from "react";
import type { Adaptation, Ingredient, Recipe } from "../types";
import { whyNotFit, type Profile } from "../planner";
import { EFFORT_LABEL, PROTEIN_SOURCE_LABEL, caProtein, caSalt, quantity as fmtQuantity, sv } from "../format";
import { Button, FitBadge, RecipeImage, ScreenHeader } from "./ui";

const UNIT_LABEL: Record<string, string> = {
  forp: "förp",
  pase: "påse",
  klyfta: "klyfta",
  knippe: "knippe",
  kruka: "kruka",
  burk: "burk",
  st: "st",
};

const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [0.33, "⅓"],
  [0.5, "½"],
  [0.67, "⅔"],
  [0.75, "¾"],
];

/** Kort beskrivning per anpassning för raden "Njurvänlig version: ...". */
const ADAPTATION_SHORT: Record<Adaptation["kind"], string> = {
  "skippa-salt": "utan tillsatt salt",
  "byt-buljong": "saltfri buljong",
  "minska-kott": "mindre kött eller fisk",
  "byt-ost": "mindre ost",
  "skolj-konserv": "sköljda konserver",
  "byt-charkuteri": "mindre charkuterier",
  "egen-kryddmix": "egen kryddmix utan salt",
  "byt-soja": "mindre soja",
  "mer-gronsaker": "mer grönsaker",
  annat: "anpassad",
};

function niceQuantity(q: number, unit: string | undefined): string {
  if (unit === "g") {
    if (q >= 100) return String(Math.round(q / 5) * 5);
    return String(Math.round(q));
  }
  if (unit === "kg") return fmtQuantity(Math.round(q * 100) / 100);
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.05) return String(whole);
  const frac = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.09);
  if (frac) return whole > 0 ? `${whole}${frac[1]}` : frac[1];
  return fmtQuantity(q);
}

/** Den njurvänliga mängden: receptets mängd x portionsfaktor x anpassningsfaktor. */
function adaptedLine(ing: Ingredient, portionFactor: number): string {
  const f = portionFactor * (ing.adapted?.factor ?? 1);
  const note = ing.adapted?.note ? `, ${ing.adapted.note}` : "";
  if (typeof ing.quantity !== "number") return `${ing.raw || ing.name}${note}`;
  const q = niceQuantity(ing.quantity * f, ing.unit);
  const unit = ing.unit ? (UNIT_LABEL[ing.unit] ?? ing.unit) : "";
  const unitPart = unit && unit !== "st" ? ` ${unit}` : "";
  return `${q}${unitPart} ${ing.name}${note}`.replace(/\s+/g, " ").trim();
}

function isRemoved(ing: Ingredient): boolean {
  return ing.adapted?.factor === 0;
}

function adaptationSummary(recipe: Recipe): string {
  const kinds = [...new Set(recipe.adaptations.map((a) => a.kind))];
  const parts = kinds.map((k) => ADAPTATION_SHORT[k]).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`;
}

export function RecipeDetail({
  recipe,
  profile,
  thresholds,
  onBack,
  onAddTonight,
}: {
  recipe: Recipe;
  profile: Profile;
  thresholds: { proteinMax: number; saltMax: number };
  onBack: () => void;
  onAddTonight: (id: string) => void;
  focusAdaptations?: boolean;
}) {
  const [portions, setPortions] = useState(profile.portions);
  const factor = portions / Math.max(recipe.portions, 1);

  useEffect(() => {
    setPortions(profile.portions);
  }, [recipe.id, profile.portions]);

  const lowCoverage = recipe.adaptedNutrition.coverage < 0.7;
  const canAdd = recipe.fit !== "passar-inte";
  const summary = adaptationSummary(recipe);
  const removedSalt = recipe.ingredientGroups.some((g) => g.ingredients.some((i) => isRemoved(i)));

  return (
    <div className="screen screen-detail">
      <ScreenHeader title={recipe.name} onBack={onBack} />
      <RecipeImage recipe={recipe} size="hero" />

      <div className="detail-meta">
        <FitBadge fit={recipe.fit} />
        <span className="muted small">
          {PROTEIN_SOURCE_LABEL[recipe.proteinSource]}
          {recipe.totalMinutes ? ` · ${recipe.totalMinutes} min` : ""}
          {` · ${EFFORT_LABEL[recipe.effort]}`}
        </span>
      </div>

      <p className="detail-nutrition">
        {caProtein(recipe.adaptedNutrition.protein)} · {caSalt(recipe.adaptedNutrition.salt)} · ca{" "}
        {sv(recipe.adaptedNutrition.energyKcal)} kcal
        <span className="muted small"> per portion</span>
      </p>

      {summary ? (
        <p className="detail-adapted">
          <span className="detail-adapted-label">Njurvänlig version:</span> {summary}. Mängderna nedan är redan
          anpassade.
        </p>
      ) : null}

      {recipe.description ? <p className="detail-desc">{recipe.description}</p> : null}

      <p className="detail-source muted small">
        {recipe.source === "koket.se" && recipe.sourceUrl ? (
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            Utgår från ett recept på köket.se{recipe.author ? `, ${recipe.author}` : ""}
          </a>
        ) : (
          <>Eget recept{recipe.author ? `, ${recipe.author}` : ""}</>
        )}
      </p>

      {recipe.fit === "passar-inte" ? (
        <section className="card adapt-card adapt-card-no">
          <h2>Passar inte</h2>
          <p>{whyNotFit(recipe, thresholds)}</p>
          <p className="muted small">
            Även anpassad landar den på {caProtein(recipe.adaptedNutrition.protein)} och{" "}
            {caSalt(recipe.adaptedNutrition.salt)} per portion.
          </p>
        </section>
      ) : null}

      {lowCoverage ? <p className="note">Siffrorna är osäkra, några ingredienser kunde inte räknas.</p> : null}

      <section className="detail-section">
        <div className="section-head">
          <h2>Ingredienser</h2>
          <div className="stepper" role="group" aria-label="Antal portioner">
            <button
              type="button"
              onClick={() => setPortions(Math.max(1, portions - 1))}
              aria-label="Färre portioner"
              disabled={portions <= 1}
            >
              &minus;
            </button>
            <span>
              {portions} {portions === 1 ? "portion" : "port."}
            </span>
            <button
              type="button"
              onClick={() => setPortions(Math.min(8, portions + 1))}
              aria-label="Fler portioner"
              disabled={portions >= 8}
            >
              +
            </button>
          </div>
        </div>
        {recipe.ingredientGroups.map((group, gi) => {
          const shown = group.ingredients.filter((ing) => !isRemoved(ing));
          if (shown.length === 0) return null;
          return (
            <div key={gi} className="ing-group">
              {group.title ? <h3>{group.title}</h3> : null}
              <ul className="ing-list">
                {shown.map((ing, ii) => (
                  <li key={ii} className={ing.matched ? "" : "ing-unmatched"}>
                    {adaptedLine(ing, factor)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {removedSalt ? (
          <p className="muted small">Utan tillsatt salt. Smaka av med citron, peppar och örter i stället.</p>
        ) : null}
        {recipe.portions !== portions ? (
          <p className="muted small">Receptet är skrivet för {recipe.portions} portioner, mängderna är omräknade.</p>
        ) : null}
      </section>

      <section className="detail-section">
        <h2>Gör så här</h2>
        <ol className="steps">
          {recipe.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      {canAdd ? (
        <div className="detail-cta">
          <Button full onClick={() => onAddTonight(recipe.id)}>
            Lägg in i kväll
          </Button>
        </div>
      ) : null}
    </div>
  );
}
