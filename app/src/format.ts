/** Formatering på svenska: decimalkomma, "ca" före näringssiffror, veckodagar. */

export const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
export const WEEKDAYS_SHORT = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

/** Tal med svenskt decimalkomma. */
export function sv(n: number, decimals = 0): string {
  const rounded = n.toFixed(decimals);
  return rounded.replace(".", ",").replace(/^-0(,0+)?$/, "0$1");
}

export function caProtein(g: number): string {
  return `ca ${sv(g, 0)} g protein`;
}

export function caSalt(g: number): string {
  return `ca ${sv(g, 1)} g salt`;
}

/** "ca 19 g protein · ca 0,6 g salt" */
export function nutritionLine(n: { protein: number; salt: number }): string {
  return `${caProtein(n.protein)} · ${caSalt(n.salt)}`;
}

/** Effekt som "−9 g protein" eller "−0,7 g salt". */
export function effectLabel(effect?: { protein?: number; salt?: number }): string[] {
  if (!effect) return [];
  const parts: string[] = [];
  if (effect.protein) parts.push(`${signed(effect.protein, 0)} g protein`);
  if (effect.salt) parts.push(`${signed(effect.salt, 1)} g salt`);
  return parts;
}

function signed(n: number, decimals: number): string {
  const abs = sv(Math.abs(n), decimals);
  return n < 0 ? `−${abs}` : `+${abs}`;
}

/** 0 = måndag ... 6 = söndag */
export function todayIndex(date = new Date()): number {
  return (date.getDay() + 6) % 7;
}

/** "måndag 7 september" */
export function longDate(date = new Date()): string {
  return `${WEEKDAYS[todayIndex(date)].toLowerCase()} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Datum för en given veckodag i den vecka som `date` tillhör. */
export function dateForDayIndex(dayIndex: number, date = new Date()): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - todayIndex(date) + dayIndex);
  return d;
}

/** "7/9" */
export function shortDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/** Skala en mängd och skriv snyggt: 1,5 → "1,5", 2 → "2", 0,333 → "0,3". */
export function quantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (n < 1) return sv(n, 1);
  const oneDecimal = Math.round(n * 10) / 10;
  return Number.isInteger(oneDecimal) ? String(oneDecimal) : sv(oneDecimal, 1);
}

export const PROTEIN_SOURCE_LABEL: Record<string, string> = {
  fisk: "Fisk",
  fagel: "Fågel",
  kott: "Kött",
  vegetariskt: "Vegetariskt",
  "agg-mejeri": "Ägg & mejeri",
  blandat: "Blandat",
};

export const EFFORT_LABEL: Record<string, string> = {
  enkel: "Enkel",
  medel: "Medel",
  "fran-grunden": "Från grunden",
};

export const FIT_LABEL: Record<string, string> = {
  passar: "Passar",
  anpassa: "Anpassad",
  "passar-inte": "Passar inte",
};

export const ADAPTATION_LABEL: Record<string, string> = {
  "skippa-salt": "Skippa saltet",
  "byt-buljong": "Byt buljongen",
  "minska-kott": "Mindre kött eller fisk",
  "byt-ost": "Mindre eller mildare ost",
  "skolj-konserv": "Skölj konserven",
  "byt-charkuteri": "Byt charkuterierna",
  "egen-kryddmix": "Egen kryddblandning",
  "byt-soja": "Mindre soja",
  "mer-gronsaker": "Mer grönsaker",
  annat: "Annat",
};
