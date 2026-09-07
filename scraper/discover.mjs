/**
 * Steg 1: hämta/cacha sitemap, plocka ut slugs och välj kandidat-URL:er (max 900) deterministiskt.
 */
import fs from "node:fs";
import {
  ensureDirs, politeFetch, writeJson, fnv1a, isMain,
  SITEMAP_URL, SITEMAP_CACHE, CANDIDATES_CACHE, MAX_CANDIDATES, KOKET_BASE,
} from "./config.mjs";

// Uteslut sött, bakverk, dryck, tillbehör, förrätter (substräng på normaliserad slug)
const EXCLUDE_WORDS = [
  "kaka", "kakor", "tarta", "glass", "dessert", "cheesecake", "mousse", "pannacotta", "panna-cotta", "kladdkaka",
  "bulle", "bullar", "muffin", "sylt", "marmelad", "drink", "cocktail", "smoothie", "dryck", "saft", "glogg", "godis",
  "pralin", "choklad", "brod", "limpa", "frukost", "pannkak", "plattar", "vaffl", "vaffel", "kex", "cookie", "brownie",
  "semla", "semlor", "lussekatt", "pepparkak", "sockerkaka", "mazarin", "parfait", "sorbet", "fromage", "kompott",
  "tiramisu", "pavlova", "marang", "bakelse", "rulltarta", "biskvi", "macaron", "tryffel", "fudge", "kolasas", "karamell",
  "nougat", "glasyr", "frosting", "likor", "punsch", "lemonad", "milkshake", "julgodis", "efterratt", "snacks", "granola",
  "musli", "scones", "churros", "chokladboll", "havreboll", "energibar", "proteinbar", "baguette", "focaccia", "knacke",
  "skorpor", "tosca", "dressing", "vinagrett", "marinad", "kryddblandning", "kryddmix", "hummus", "guacamole", "tzatziki",
  "tsatsiki", "raita", "chutney", "pickl", "inlagd", "inlagda", "snittar", "canape", "bruschetta", "crostini", "tartar",
  "toast", "glace", "suffle", "smorgas", "wienerbrod", "croissant", "kanelbull", "kardemumma", "sockerkringl", "kringl",
  "sirap", "curd", "kram-", "vaniljsas", "chokladsas", "karamellsas", "sylt", "gele", "mos-", "appelmos", "chips",
  "popcorn", "dippsas", "dipp", "salsa", "pesto", "aioli", "majonnas", "bearnaise", "hollandaise", "smorsas", "graddsas",
  "brunsas", "rodvinssas", "bbq-sas", "barbecuesas", "ketchup", "senap", "rostade-notter", "kryddsmor", "ortsmor",
  "-recept", "recept-", "tips", "guide", "sa-gor-du", "allt-om", "test", "video", "avsnitt", "sasong", "program",
  "tavling", "vinnare", "koket", "julbord", "julskinka", "pafyllning", "ost-och", "ostbricka", "juice", "lassi", "kombucha",
  "te-", "kaffe", "latte", "chai", "cider", "punch", "bal", "mingel", "picknick", "matlada", "matlador", "barnkalas",
];
const EXCLUDE_RE = new RegExp(EXCLUDE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
const SWEET_PAJ_RE = /(appel|apple|rabarber|blabar|jordgubb|hallon|banan|citron|paron|plommon|korsbar|kokos|nutella|pecan|frukt|bar|smul)-?paj|paj-?(med|pa)-(appel|apple|rabarber|blabar|jordgubb|hallon|banan|citron|paron|plommon|korsbar|kokos|frukt|bar)/;
const NON_RECIPE_RE = /(^|-)(sas|smor)$|^(sas|smor)-/;
const MUST_INCLUDE = ["torsk-med-brynt-kapris-och-citronsmor", "marry-me-linsgryta"];

/** Grupper med prioritet (första träff vinner) och kvot. */
const GROUPS = [
  ["fisk", /torsk|(^|-)lax|kolja|(^|-)sej(-|$)|fisk|(^|-)rak(or|a|-|$)|rakor|skaldjur|mussl|tonfisk|stromming|spatta|(^|-)gos(-|$)|abborre|roding|makrill|halleflundra|piggvar|kummel|hoki|kraft|hummer|krabba|scampi|blackfisk|calamari|sjotunga|marulk|regnbage|oring|sill(-|$)|skagen/, 200],
  ["fagel", /kyckling|kalkon|anka|(^|-)hona(-|$)|fagel|chicken/, 130],
  ["veg", /lins|(^|-)bon(or|a|-|$)|bonor|kikart|vegetar|veget|vegan|gronsak|tofu|halloumi|quorn|falafel|svamp|champinjon|kantarell|aubergine|zucchini|blomkal|broccoli|spenat|rotfrukt|pumpa|sotpotatis|gronkal|vitkal|rodbet|morot|morotter|palsternack|fankal|sparris|paprika|majs|(^|-)art(a|or|-|$)|artor|(^|-)kal-|-kal(-|$)|potatis|rotselleri|jordartskock|squash|feta|mozzarella|(^|-)ost-|-ost(-|$)|(^|-)agg(-|$|rora)|omelett|tempeh|seitan|bongryta|dal(-|$)|dahl|chana|paneer|edamame|grona-artor|tomat|lok(-|$)|purjo|selleri|ratatouille|caponata|risotto|gnocchi|frittata|shakshuka|bulgur|quinoa|couscous/, 220],
  ["kott", /fars|kottbull|pytt|korv|bacon|flask|biff|kott|lamm|hogrev|kotlett|karre|schnitzel|skinka|chorizo|kassler|revben|ribs|entrecote|oxfile|ryggbiff|rostbiff|kalops|lovbiff|pannbiff|wallenberg|kaldolm|kalpudding|dillkott|sjomansbiff|stroganoff|bolognese|carbonara|lasagne|hamburg|burgare|pulled|kebab|gyros|vilt|(^|-)alg(-|$)|hjort|radjur|renskav|salsiccia|pancetta|isterband|kalv|oxsvans|ossobuco|gulasch|chili-con-carne|tacofars|kofta|kottfars|kottgryta|flaskfile|karre|meatball|steak/, 180],
  ["dishes", /gryta|soppa|wok|pasta|spaghetti|tagliatelle|penne|sallad|gratang|curry|taco|pizza|bowl|nudlar|nudel|paella|pilaff|biryani|ramen|(^|-)pho(-|$)|pad-thai|sushi|poke|moussaka|minestrone|raggmunk|palt|fricasse|frikadell|planka|lada(-|$)|pudding|quesadilla|enchilada|burrito|wrap|tortilla|dumpling|bao(-|$)|bibimbap|tagine|tarte|galette|pie(-|$)|carpaccio|ceviche|tapas|meze|antipasti|spett|grill|ugnsbak|ugns|stekt|kokt|bakad|rostad|fylld|gratin|risoni|(^|-)ris-|-ris(-|$)|fried-rice|nasi|satay|teriyaki|yakitori|katsu|karaage|stir-fry|pytt|hash|nachos|tacos|kimchi|laksa|tom-yum|tom-kha|massaman|panang|tikka|korma|vindaloo|rendang|bulgogi|gyoza|tempura|okonomiyaki|falafel|kofte|lahmacun|pide|borek|pierogi|pelmeni|varmratt|middag|vardag|lunch/, 170],
];

export function normalizeSlug(seg) {
  return seg.toLowerCase().replace(/_/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function classifySlug(slug) {
  const s = normalizeSlug(slug);
  if (!s.includes("-")) return null; // enstaka ord: personer, program, ämnessidor
  if (EXCLUDE_RE.test(s) || SWEET_PAJ_RE.test(s) || NON_RECIPE_RE.test(s)) return null;
  for (const [name, re] of GROUPS) if (re.test(s)) return name;
  return null;
}

export async function loadSitemap() {
  if (fs.existsSync(SITEMAP_CACHE)) return fs.readFileSync(SITEMAP_CACHE, "utf8");
  console.log(`Hämtar ${SITEMAP_URL} ...`);
  const res = await politeFetch(SITEMAP_URL, { accept: "application/xml,text/xml" });
  if (!res.ok) throw new Error(`Sitemap: HTTP ${res.status}`);
  fs.writeFileSync(SITEMAP_CACHE, res.text);
  return res.text;
}

export async function discover() {
  ensureDirs();
  const xml = await loadSitemap();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].trim());
  console.log(`Sitemap: ${locs.length} URL:er`);

  const bySlug = new Map();
  let multi = 0;
  for (const loc of locs) {
    let u;
    try { u = new URL(loc); } catch { continue; }
    if (!u.hostname.endsWith("koket.se")) continue;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) continue;
    const isSingle = segs.length === 1;
    if (!isSingle && !segs.includes("varmratter")) continue; // gamla djupa URL:er: bara varmrätter
    const slug = normalizeSlug(segs[segs.length - 1]);
    const group = classifySlug(slug);
    if (!group) continue;
    if (!isSingle) multi++;
    const existing = bySlug.get(slug);
    if (!existing || (!existing.single && isSingle)) {
      bySlug.set(slug, { slug, url: `${KOKET_BASE}${u.pathname}`, group, single: isSingle });
    }
  }
  const pool = [...bySlug.values()];
  const poolByGroup = {};
  for (const c of pool) (poolByGroup[c.group] ??= []).push(c);
  console.log("Kandidatpool per grupp:", Object.fromEntries(Object.entries(poolByGroup).map(([k, v]) => [k, v.length])), `(varav ${multi} från gamla URL:er)`);

  // Deterministiskt urval: ordna på FNV-hash av slug, ta kvoten per grupp, fyll upp rest.
  const order = (a, b) => fnv1a(a.slug) - fnv1a(b.slug) || a.slug.localeCompare(b.slug);
  const selected = [];
  const rest = [];
  for (const [name, , quota] of GROUPS) {
    const list = (poolByGroup[name] ?? []).sort(order);
    selected.push(...list.slice(0, quota));
    rest.push(...list.slice(quota));
  }
  rest.sort(order);
  while (selected.length < MAX_CANDIDATES && rest.length) selected.push(rest.shift());
  // Referensrecept för sanity-check ska alltid med.
  for (const slug of MUST_INCLUDE) {
    if (selected.some((c) => c.slug === slug)) continue;
    const c = bySlug.get(slug) ?? { slug, url: `${KOKET_BASE}/${slug}`, group: "fisk" };
    selected.splice(0, 0, c);
  }
  const final = selected.slice(0, MAX_CANDIDATES).map(({ slug, url, group }) => ({ slug, url, group }));

  const counts = {};
  for (const c of final) counts[c.group] = (counts[c.group] ?? 0) + 1;
  console.log(`Valda kandidater: ${final.length}`, counts);
  console.log("Exempel:", final.slice(0, 8).map((c) => c.slug).join(", "));
  writeJson(CANDIDATES_CACHE, final, true);
  return final;
}

if (isMain(import.meta.url)) {
  discover().catch((e) => { console.error(e); process.exit(1); });
}
