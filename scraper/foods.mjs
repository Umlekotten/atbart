/**
 * Steg 3: Livsmedelsverkets livsmedelslista -> data/livsmedel.json,
 * näringsvärden för alla livsmedel som ingredient-map.mjs pekar på -> data/nutrients.json.
 * Skriver också en granskningstabell mönster -> livsmedel (protein/salt) till konsolen.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ensureDirs, politeFetch, readJson, writeJson, workerPool, isMain,
  SLV_BASE, LIVSMEDEL_CACHE, NUTRIENT_CACHE_DIR, DATA_DIR,
} from "./config.mjs";
import { INGREDIENT_MAP, referencedFoodIds, describePattern } from "./ingredient-map.mjs";

export async function loadFoodList() {
  let list = readJson(LIVSMEDEL_CACHE);
  if (!list) {
    list = [];
    let offset = 0;
    for (;;) {
      const url = `${SLV_BASE}/livsmedel?offset=${offset}&limit=500&sprak=1`;
      const res = await politeFetch(url, { accept: "application/json" });
      if (!res.ok) throw new Error(`Livsmedelslista: HTTP ${res.status}`);
      const json = JSON.parse(res.text);
      for (const f of json.livsmedel ?? []) list.push({ nummer: f.nummer, namn: f.namn });
      offset += (json.livsmedel ?? []).length;
      console.log(`  livsmedel ${offset}/${json._meta?.totalRecords}`);
      if (!json.livsmedel?.length || offset >= (json._meta?.totalRecords ?? 0)) break;
    }
    writeJson(LIVSMEDEL_CACHE, list);
  }
  writeJson(path.join(DATA_DIR, "livsmedel.json"), list);
  return list;
}

export function summarizeNutrients(arr) {
  const by = (code) => arr.filter((x) => x.euroFIRkod === code);
  const val = (code) => { const v = by(code)[0]?.varde; return Number.isFinite(v) ? v : undefined; };
  const kcal = by("ENERC").find((x) => /kcal/i.test(x.enhet ?? ""))?.varde;
  const nacl = val("NACL");
  const na = val("NA");
  const salt = nacl !== undefined ? nacl : na !== undefined ? na * 2.5 / 1000 : 0;
  return {
    protein: val("PROT") ?? 0,
    salt: Math.round(salt * 100) / 100,
    sodium: na ?? (nacl !== undefined ? Math.round(nacl * 400) : 0),
    potassium: val("K") ?? 0,
    phosphorus: val("P") ?? 0,
    kcal: Number.isFinite(kcal) ? kcal : 0,
  };
}

export async function fetchNutrients(id) {
  const file = path.join(NUTRIENT_CACHE_DIR, `${id}.json`);
  const cached = readJson(file);
  if (cached) return cached;
  const res = await politeFetch(`${SLV_BASE}/livsmedel/${id}/naringsvarden?sprak=1`, { accept: "application/json" });
  if (!res.ok) throw new Error(`Näringsvärden ${id}: HTTP ${res.status}`);
  const json = JSON.parse(res.text);
  writeJson(file, json);
  return json;
}

export async function foods() {
  ensureDirs();
  const list = await loadFoodList();
  const names = new Map(list.map((f) => [f.nummer, f.namn]));
  console.log(`Livsmedel: ${list.length} st`);

  const ids = referencedFoodIds();
  const nutrients = {};
  const missing = [];
  await workerPool(ids, 2, async (id) => {
    try {
      const arr = await fetchNutrients(id);
      nutrients[id] = { namn: names.get(id) ?? `#${id}`, ...summarizeNutrients(arr) };
    } catch (e) {
      missing.push([id, String(e.message)]);
    }
  });
  writeJson(path.join(DATA_DIR, "nutrients.json"), nutrients, true);
  console.log(`Näringsvärden: ${Object.keys(nutrients).length}/${ids.length} livsmedel -> data/nutrients.json`);
  if (missing.length) console.log("Saknade:", missing);

  // Granskningstabell
  console.log("\nGranskning: mönster -> livsmedel (protein g / salt g per 100 g)");
  const unknownIds = [];
  for (const e of INGREDIENT_MAP) {
    const pat = describePattern(e).padEnd(40);
    if (e.override) {
      console.log(`  ${pat} -> (uppskattat) ${e.name}  P ${e.override.protein} / S ${e.override.salt}`);
    } else if (e.isWater) {
      console.log(`  ${pat} -> (vatten, 0 näring)`);
    } else {
      const n = nutrients[e.foodId];
      if (!n) { unknownIds.push([describePattern(e), e.foodId]); continue; }
      const alt = e.altPackaged ? `  [burk: ${nutrients[e.altPackaged.foodId]?.namn ?? e.altPackaged.foodId}]` : "";
      console.log(`  ${pat} -> ${e.foodId} ${n.namn}  P ${n.protein} / S ${n.salt}${alt}`);
    }
  }
  if (unknownIds.length) console.log("VARNING: mönster utan näringsdata:", unknownIds);
  console.log(`Kartan har ${INGREDIENT_MAP.length} poster.`);
  return nutrients;
}

if (isMain(import.meta.url)) {
  foods().catch((e) => { console.error(e); process.exit(1); });
}
