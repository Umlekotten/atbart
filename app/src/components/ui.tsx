import { useEffect, useState, type ReactNode } from "react";
import type { Fit, Recipe } from "../types";
import { FIT_LABEL, sv } from "../format";

// ---------------------------------------------------------------------------
// Knappar och chips
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  full,
  type = "button",
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  small?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${full ? " btn-full" : ""}${small ? " btn-small" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  active,
  onClick,
  tone,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "ok" | "adapt" | "no";
}) {
  return (
    <button
      type="button"
      className={`chip${active ? " chip-active" : ""}${tone ? ` chip-${tone}` : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badge för hur receptet passar
// ---------------------------------------------------------------------------

export function FitBadge({ fit, hint, onClick }: { fit: Fit; hint?: string; onClick?: () => void }) {
  const cls = fit === "passar" ? "ok" : fit === "anpassa" ? "adapt" : "no";
  const content = (
    <>
      <span className={`dot dot-${cls}`} aria-hidden="true" />
      {FIT_LABEL[fit]}
      {hint ? <span className="badge-hint"> · {hint}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`badge badge-${cls} badge-btn`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <span className={`badge badge-${cls}`}>{content}</span>;
}

// ---------------------------------------------------------------------------
// Stapel: använt vs budget
// ---------------------------------------------------------------------------

export function Bar({
  value,
  max,
  tone = "primary",
  thin,
  label,
}: {
  value: number;
  max: number;
  tone?: "primary" | "muted" | "warn" | "adapt";
  thin?: boolean;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const over = max > 0 && value > max + 1e-6;
  return (
    <div
      className={`bar${thin ? " bar-thin" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <div className={`bar-fill bar-${over ? "warn" : tone}`} style={{ width: `${pct}%` }} />
      {over ? <div className="bar-overmark" /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bild eller platshållare
// ---------------------------------------------------------------------------

const SOURCE_TONE: Record<Recipe["proteinSource"], string> = {
  fisk: "fisk",
  fagel: "fagel",
  kott: "kott",
  vegetariskt: "veg",
  "agg-mejeri": "agg",
  blandat: "blandat",
};

export function RecipeImage({
  recipe,
  size = "card",
}: {
  recipe: Recipe;
  size?: "thumb" | "card" | "hero";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [recipe.id]);
  const showImage = recipe.image && !failed;
  const initial = recipe.name.trim().charAt(0).toUpperCase();
  return (
    <div className={`rimg rimg-${size} rimg-${SOURCE_TONE[recipe.proteinSource]}`} aria-hidden="true">
      {showImage ? (
        <img src={recipe.image} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="rimg-initial">{initial}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ikoner (inline SVG, ärver currentColor)
// ---------------------------------------------------------------------------

export function ChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Check({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sidhuvud och bottenark
// ---------------------------------------------------------------------------

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="screen-header">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Tillbaka">
          <ChevronLeft />
        </button>
      ) : null}
      <div className="screen-header-text">
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="screen-header-action">{action}</div> : null}
    </header>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        {title ? <h2 className="sheet-title">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Små textbitar
// ---------------------------------------------------------------------------

/** "ca 320 g av 385 g" */
export function ofBudget(value: number, max: number, unit = "g", decimals = 0): string {
  return `ca ${sv(value, decimals)} ${unit} av ${sv(max, decimals)} ${unit}`;
}
