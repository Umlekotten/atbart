/**
 * Tolkning av svenska ingrediensrader, t.ex.
 *   "1-1,5 dl mjölk"           -> { quantity: 1.25, unit: "dl", name: "mjölk" }
 *   "1 burk (400 g) kikärter"  -> { quantity: 1, unit: "burk", parenGrams: 400, name: "kikärter" }
 *   "1 citron, zest"           -> { quantity: 1, unit: "st", name: "citron" }
 *   "Potatispuré"              -> { isHeader: true }
 *
 * Kör `node scraper/ingredients.mjs` för självtest.
 */
import { isMain } from "./config.mjs";

const UNICODE_FRACTIONS = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8" };

/** enhetsord -> normaliserad enhet */
const UNIT_ALIASES = new Map(
  Object.entries({
    g: "g", gr: "g", gram: "g", kg: "kg", kilo: "kg", hg: "hg",
    dl: "dl", l: "l", liter: "l", ml: "ml", cl: "cl",
    msk: "msk", matsked: "msk", matskedar: "msk",
    tsk: "tsk", tesked: "tsk", teskedar: "tsk",
    krm: "krm", kryddmått: "krm",
    st: "st", styck: "st", stycken: "st", stk: "st",
    förp: "forp", "förp.": "forp", förpackning: "forp", förpackningar: "forp",
    paket: "forp", pkt: "forp", påse: "forp", påsar: "forp", ask: "forp", askar: "forp", tub: "forp",
    burk: "burk", burkar: "burk", flaska: "burk", flaskor: "burk",
    klyfta: "klyfta", klyftor: "klyfta",
    knippe: "knippe", knippen: "knippe", bunt: "knippe", buntar: "knippe",
    kruka: "kruka", krukor: "kruka",
    nypa: "nypa", nypor: "nypa",
    skiva: "skiva", skivor: "skiva",
    bit: "bit", bitar: "bit",
    kvist: "kvist", kvistar: "kvist",
    blad: "blad",
    stjälk: "stjalk", stjälkar: "stjalk", stånd: "stjalk",
    tärning: "tarning", tärningar: "tarning",
    portion: "portion", portioner: "portion", port: "portion", "port.": "portion", ports: "portion",
    droppar: "droppe", droppe: "droppe",
    näve: "nave", nävar: "nave",
    huvud: "st", huvuden: "st",
  })
);

const NUMBER_RE = String.raw`(\d+\/\d+|\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?)`;
const QTY_RE = new RegExp(String.raw`^${NUMBER_RE}(?:\s*(?:-|–|—|till)\s*${NUMBER_RE})?\s*`);

function toNumber(token) {
  if (!token) return undefined;
  const t = token.trim().replace(",", ".");
  const mixed = t.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parenWeight(text) {
  // "(400 g)", "(à 400 g)", "(ca 1,2 kg)", "(2 x 400 g)"
  const m = text.replace(",", ".").match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gram|hg|ml|dl|cl|l)\b/i);
  if (!m) return undefined;
  const n = Number(m[2]) * (m[1] ? Number(m[1]) : 1);
  const u = m[3].toLowerCase();
  const factor = { kg: 1000, g: 1, gram: 1, hg: 100, ml: 1, dl: 100, cl: 10, l: 1000 }[u];
  return n * factor; // ml ~ g för vätskor
}

/** Städar namnet: tar bort text efter komma, fyllnadsord och skräp. */
export function cleanName(name) {
  let s = name;
  s = s.split(/,|;| - | – /)[0];
  s = s.replace(/\b(ca|cirka|ungefär|c:a)\b\.?/gi, " ");
  s = s.replace(/\b(gärna|eventuellt|ev|evt|ekologisk[at]?|eko|valfri[at]?|helst|typ|osaltat|osaltade|osaltad)\b\.?/gi, " ");
  s = s.replace(/\b(till|för|att)\s+(stekning|servering|garnering|pensling|fritering|smörjning|formen|plåten|dekoration|toppning)\b.*$/i, " ");
  s = s.replace(/\b(att steka i|efter smak|efter behag|om så önskas|om du vill|vid behov|som tillbehör)\b.*$/i, " ");
  s = s.replace(/\s+/g, " ").replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, "").trim();
  return s;
}

/**
 * Tolkar en rad. `isKnownIngredient(name)` används för rubrik-heuristiken
 * (rad utan mängd som börjar med stor bokstav och inte matchar något känt livsmedel = rubrik).
 */
export function parseIngredientLine(raw, lookup = () => null) {
  const original = String(raw ?? "").trim();
  let s = original.replace(/\s+/g, " ");
  for (const [k, v] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replace(new RegExp(`(\\d)${k}`, "g"), `$1 ${v}`).replace(new RegExp(k, "g"), v);
  }

  // Parenteser: plocka ut vikt, ta bort dem från texten
  let parenGrams;
  const parens = [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  for (const p of parens) {
    const w = parenWeight(p);
    if (w !== undefined && parenGrams === undefined) parenGrams = w;
  }
  s = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  // Rubrik med kolon
  if (/:$/.test(s) && !QTY_RE.test(s)) {
    return { raw: original, name: cleanName(s.replace(/:$/, "")), isHeader: true };
  }

  // "2 x 400 g krossade tomater" -> 800 g
  let multiplier = 1;
  const mult = s.match(/^(\d+)\s*[x×]\s*(?=\d)/);
  if (mult) {
    multiplier = Number(mult[1]);
    s = s.slice(mult[0].length);
  }

  s = s.replace(/^(ca|cirka|c:a|ungefär|knappt|drygt)\.?\s+/i, "");

  let quantity;
  let unit;
  const qm = s.match(QTY_RE);
  if (qm) {
    const a = toNumber(qm[1]);
    const b = toNumber(qm[2]);
    quantity = b !== undefined && a !== undefined ? (a + b) / 2 : a;
    if (quantity !== undefined) quantity *= multiplier;
    s = s.slice(qm[0].length);
    // "à 400 g" direkt efter antal
    // Enhet
    const um = s.match(/^([a-zA-ZåäöÅÄÖ.]+)\b\.?\s*/);
    if (um) {
      const key = um[1].toLowerCase().replace(/\.$/, "");
      if (UNIT_ALIASES.has(key)) {
        unit = UNIT_ALIASES.get(key);
        s = s.slice(um[0].length);
      }
    }
    if (unit === undefined) unit = "st"; // "2 ägg", "10 potatisar"
    // "2 st ägg" -> redan st; "1 st förp" ovanligt
    if (unit === "st") {
      const um2 = s.match(/^([a-zA-ZåäöÅÄÖ]+)\b\s*/);
      if (um2 && UNIT_ALIASES.has(um2[1].toLowerCase()) && UNIT_ALIASES.get(um2[1].toLowerCase()) !== "st") {
        unit = UNIT_ALIASES.get(um2[1].toLowerCase());
        s = s.slice(um2[0].length);
      }
    }
  }

  // "salt och peppar" -> behåll hela, hanteras av kartan (salt)
  let name = cleanName(s);
  if (!name) name = cleanName(original.replace(/\([^)]*\)/g, ""));

  if (quantity === undefined) {
    const startsUpper = /^[A-ZÅÄÖ]/.test(name);
    if (startsUpper) {
      const entry = lookup(name);
      const singleWord = !/\s/.test(name);
      const phrase = /(^|\s)(med|och|till|för|på|i|à la)(\s|$)/i.test(name);
      // Rubrik: okänt ord, eller känt ord som står ensamt ("Torsk", "Potatispuré"),
      // eller en fras ("Brynt smör med kapris och citron"). Saltrader är aldrig rubrik.
      if (!entry?.isSalt && (!entry || singleWord || phrase)) {
        return { raw: original, name, isHeader: true };
      }
    }
  }

  return { raw: original, quantity, unit, name, parenGrams };
}

// ---------------------------------------------------------------------------
// Självtest: node scraper/ingredients.mjs
// ---------------------------------------------------------------------------
export function selfTest() {
  const known = (n) => (/torsk|potatis|salt|dill|olivolja|smör|lök|ägg|mjöl|kapris|sallad/i.test(n) ? { isSalt: /salt/i.test(n) } : null);
  const cases = [
    ["600 g torskrygg (eller torskfilé)", { quantity: 600, unit: "g", name: "torskrygg" }],
    ["1,5 dl vispgrädde", { quantity: 1.5, unit: "dl", name: "vispgrädde" }],
    ["1-1,5 dl mjölk", { quantity: 1.25, unit: "dl", name: "mjölk" }],
    ["1–2 msk soja", { quantity: 1.5, unit: "msk", name: "soja" }],
    ["1/2 citron", { quantity: 0.5, unit: "st", name: "citron" }],
    ["1 1/2 tsk salt", { quantity: 1.5, unit: "tsk", name: "salt" }],
    ["½ dl olivolja", { quantity: 0.5, unit: "dl", name: "olivolja" }],
    ["1½ dl ris", { quantity: 1.5, unit: "dl", name: "ris" }],
    ["¼ tsk cayennepeppar", { quantity: 0.25, unit: "tsk", name: "cayennepeppar" }],
    ["ca 800 g mjölig potatis", { quantity: 800, unit: "g", name: "mjölig potatis" }],
    ["cirka 2 dl vatten", { quantity: 2, unit: "dl", name: "vatten" }],
    ["1 burk (400 g) kikärter", { quantity: 1, unit: "burk", parenGrams: 400, name: "kikärter" }],
    ["1 förp (500 g) krossade tomater", { quantity: 1, unit: "forp", parenGrams: 500, name: "krossade tomater" }],
    ["2 burkar krossade tomater (à 400 g)", { quantity: 2, unit: "burk", parenGrams: 400, name: "krossade tomater" }],
    ["1 kg potatis (ca 8 st)", { quantity: 1, unit: "kg", name: "potatis", parenGrams: undefined }],
    ["1 citron, zest", { quantity: 1, unit: "st", name: "citron" }],
    ["2 klyftor vitlök, finhackade", { quantity: 2, unit: "klyfta", name: "vitlök" }],
    ["3 vitlöksklyftor", { quantity: 3, unit: "st", name: "vitlöksklyftor" }],
    ["1 knippe färsk dill", { quantity: 1, unit: "knippe", name: "färsk dill" }],
    ["1 kruka basilika", { quantity: 1, unit: "kruka", name: "basilika" }],
    ["4 skivor bacon", { quantity: 4, unit: "skiva", name: "bacon" }],
    ["1 nypa salt", { quantity: 1, unit: "nypa", name: "salt" }],
    ["2 ägg", { quantity: 2, unit: "st", name: "ägg" }],
    ["10 mjöliga potatisar", { quantity: 10, unit: "st", name: "mjöliga potatisar" }],
    ["2 msk smör till stekning", { quantity: 2, unit: "msk", name: "smör" }],
    ["olivolja till stekning", { quantity: undefined, unit: undefined, name: "olivolja" }],
    ["salt", { quantity: undefined, name: "salt", isHeader: undefined }],
    ["flingsalt", { quantity: undefined, name: "flingsalt" }],
    ["färsk dill", { quantity: undefined, name: "färsk dill" }],
    ["Potatispuré", { isHeader: true, name: "Potatispuré" }],
    ["Tillbehör", { isHeader: true }],
    ["Torsk", { isHeader: true }],
    ["Brynt smör med kapris och citron", { isHeader: true }],
    ["Brynt smör med kapris och citron:", { isHeader: true }],
    ["Zeta extra jungfruolivolja classico (till stekning)", { isHeader: undefined, name: "Zeta extra jungfruolivolja classico" }],
    ["Salt och peppar", { isHeader: undefined, name: "Salt och peppar" }],
    ["1 tärning grönsaksbuljong", { quantity: 1, unit: "tarning", name: "grönsaksbuljong" }],
    ["2 dl kokt ris (1 dl okokt)", { quantity: 2, unit: "dl", name: "kokt ris", parenGrams: 100 }],
    ["1 st paprika, röd", { quantity: 1, unit: "st", name: "paprika" }],
    ["1 påse tacokrydda (28 g)", { quantity: 1, unit: "forp", parenGrams: 28, name: "tacokrydda" }],
    ["0,5 dl finhackad persilja", { quantity: 0.5, unit: "dl", name: "finhackad persilja" }],
    ["2 x 400 g krossade tomater", { quantity: 800, unit: "g", name: "krossade tomater" }],
  ];
  let fails = 0;
  for (const [line, expected] of cases) {
    const got = parseIngredientLine(line, known);
    for (const [k, v] of Object.entries(expected)) {
      const g = got[k];
      const ok = typeof v === "number" ? Math.abs((g ?? NaN) - v) < 1e-9 : g === v;
      if (!ok) {
        fails++;
        console.log(`FAIL "${line}" -> ${k}: förväntade ${JSON.stringify(v)}, fick ${JSON.stringify(g)}   (${JSON.stringify(got)})`);
      }
    }
  }
  console.log(`ingredients.mjs självtest: ${cases.length} rader, ${fails} fel`);
  return fails === 0;
}

if (isMain(import.meta.url)) {
  process.exit(selfTest() ? 0 : 1);
}
