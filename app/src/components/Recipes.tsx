import { useMemo, useState } from "react";
import type { Fit, Recipe } from "../types";
import { EFFORT_LABEL, PROTEIN_SOURCE_LABEL, nutritionLine } from "../format";
import { Chip, ChevronRight, FitBadge, RecipeImage, ScreenHeader } from "./ui";

const FIT_ORDER: Record<Fit, number> = { passar: 0, anpassa: 1, "passar-inte": 2 };

export function Recipes({ recipes, onOpen }: { recipes: Recipe[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState<Fit | null>(null);
  const [onlyEnkla, setOnlyEnkla] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => (fit ? r.fit === fit : r.fit !== "passar-inte"))
      .filter((r) => (onlyEnkla ? r.effort === "enkel" : true))
      .filter((r) => {
        if (!q) return true;
        const hay = [
          r.name,
          r.description,
          PROTEIN_SOURCE_LABEL[r.proteinSource],
          ...r.keywords,
          ...r.cuisine,
          ...r.category,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => FIT_ORDER[a.fit] - FIT_ORDER[b.fit] || a.name.localeCompare(b.name, "sv"));
  }, [recipes, query, fit, onlyEnkla]);

  return (
    <div className="screen">
      <ScreenHeader title="Recept" subtitle={`${list.length} rätter som passar dig`} />

      <input
        type="search"
        className="search"
        placeholder="Sök rätt, råvara eller kök"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Sök recept"
      />

      <div className="chip-row chip-row-scroll">
        <Chip active={fit === "passar"} tone="ok" onClick={() => setFit(fit === "passar" ? null : "passar")}>
          Passar
        </Chip>
        <Chip active={fit === "anpassa"} tone="adapt" onClick={() => setFit(fit === "anpassa" ? null : "anpassa")}>
          Anpassa
        </Chip>
        <Chip
          active={fit === "passar-inte"}
          tone="no"
          onClick={() => setFit(fit === "passar-inte" ? null : "passar-inte")}
        >
          Passar inte
        </Chip>
        <Chip active={onlyEnkla} onClick={() => setOnlyEnkla(!onlyEnkla)}>
          Enkla
        </Chip>
      </div>

      {list.length === 0 ? (
        <section className="card">
          <p className="muted">Inget recept matchar. Prova ett annat ord eller släpp ett filter.</p>
        </section>
      ) : null}

      <ul className="recipe-list">
        {list.map((r) => (
          <li key={r.id}>
            <button type="button" className="recipe-row" onClick={() => onOpen(r.id)}>
              <RecipeImage recipe={r} size="thumb" />
              <span className="recipe-row-body">
                <span className="recipe-row-name">{r.name}</span>
                <span className="muted small">
                  {PROTEIN_SOURCE_LABEL[r.proteinSource]}
                  {r.totalMinutes ? ` · ${r.totalMinutes} min` : ""}
                  {` · ${EFFORT_LABEL[r.effort]}`}
                </span>
                <span className="small">{nutritionLine(r.adaptedNutrition)}</span>
                <span className="recipe-row-badge">
                  <FitBadge fit={r.fit} />
                </span>
              </span>
              <span className="day-chevron">
                <ChevronRight />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
