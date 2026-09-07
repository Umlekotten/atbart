/**
 * Gemensam konfiguration, sökvägar, cache-hjälpare och en "snäll" fetch
 * (max 2 samtidiga anrop per värd, minst 500 ms mellan starter mot koket.se,
 * exponentiell backoff på 429/5xx, max 3 försök).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Node 24 kör TypeScript-filer utan typer direkt. Om importen skulle sluta fungera:
// duplicera konstanterna här (proteinMax 20, saltMax 1.5, UNQUANTIFIED_SALT_GRAMS 3)
// och peka på ../data/recipe-schema.ts som källa.
import { DEFAULT_THRESHOLDS, UNQUANTIFIED_SALT_GRAMS } from "../data/recipe-schema.ts";

export { DEFAULT_THRESHOLDS, UNQUANTIFIED_SALT_GRAMS };

export const SCRAPER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRAPER_DIR, "..");
export const CACHE_DIR = path.join(SCRAPER_DIR, ".cache");
export const HTML_DIR = path.join(CACHE_DIR, "html");
export const RAW_DIR = path.join(CACHE_DIR, "raw");
export const NUTRIENT_CACHE_DIR = path.join(CACHE_DIR, "nutrients");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const APP_DATA_DIR = path.join(ROOT_DIR, "app", "src", "data");

export const SITEMAP_CACHE = path.join(CACHE_DIR, "sitemap.xml");
export const CANDIDATES_CACHE = path.join(CACHE_DIR, "candidates.json");
export const SCRAPE_LOG = path.join(CACHE_DIR, "scrape-log.json");
export const LIVSMEDEL_CACHE = path.join(CACHE_DIR, "livsmedel.json");

export const USER_AGENT = "Mozilla/5.0 (compatible; recipe-research-hackathon/0.1)";
export const KOKET_BASE = "https://www.koket.se";
export const SITEMAP_URL = `${KOKET_BASE}/sitemap.xml`;
export const SLV_BASE = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1";

export const MAX_CANDIDATES = 900;
export const DEFAULT_PORTIONS = 4;
export const MIN_COVERAGE = 0.6;

export function ensureDirs() {
  for (const d of [CACHE_DIR, HTML_DIR, RAW_DIR, NUTRIENT_CACHE_DIR, DATA_DIR, APP_DATA_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function readJson(file, fallback = undefined) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, obj, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deterministisk 32-bitars hash (FNV-1a) för reproducerbar "slumpordning". */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function safeFileName(slug) {
  return slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

/** True om modulen körs direkt (node fil.mjs) och inte bara importeras. */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

// ---------------------------------------------------------------------------
// Snäll fetch med per-värd-kö
// ---------------------------------------------------------------------------

class HostQueue {
  constructor({ concurrency, minIntervalMs }) {
    this.concurrency = concurrency;
    this.minIntervalMs = minIntervalMs;
    this.active = 0;
    this.nextStart = 0;
    this.waiters = [];
  }
  async acquire() {
    while (this.active >= this.concurrency) {
      await new Promise((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    const now = Date.now();
    const start = Math.max(now, this.nextStart);
    this.nextStart = start + this.minIntervalMs;
    if (start > now) await sleep(start - now);
  }
  release() {
    this.active--;
    const w = this.waiters.shift();
    if (w) w();
  }
}

const HOST_QUEUES = new Map();
function queueFor(hostname) {
  if (!HOST_QUEUES.has(hostname)) {
    const cfg = hostname.endsWith("koket.se")
      ? { concurrency: 2, minIntervalMs: 500 }
      : { concurrency: 2, minIntervalMs: 250 };
    HOST_QUEUES.set(hostname, new HostQueue(cfg));
  }
  return HOST_QUEUES.get(hostname);
}

export const fetchStats = { requests: 0, retries: 0, failures: 0 };

/**
 * Hämtar en URL snällt. Returnerar { status, ok, text, url }.
 * Kastar efter `retries` misslyckade försök (nätfel, 429, 5xx).
 * 4xx (utom 429) returneras direkt utan nytt försök.
 */
export async function politeFetch(url, { retries = 3, accept = "*/*", timeoutMs = 45000 } = {}) {
  const q = queueFor(new URL(url).hostname);
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    await q.acquire();
    try {
      fetchStats.requests++;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "sv-SE,sv;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Math.min(60000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500;
        q.release();
        fetchStats.retries++;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff);
        continue;
      }
      const text = await res.text();
      q.release();
      return { status: res.status, ok: res.ok, text, url: res.url };
    } catch (err) {
      lastErr = err;
      q.release();
      fetchStats.retries++;
      await sleep(Math.min(60000, 1000 * 2 ** (attempt - 1)));
    }
  }
  fetchStats.failures++;
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

/** Enkel arbetarpool: kör fn(item) för alla items med max `size` samtidigt. */
export async function workerPool(items, size, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** "PT1H30M" -> 90. Tom/okänd -> undefined. */
export function parseIsoDuration(s) {
  if (!s || typeof s !== "string") return undefined;
  const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const minutes = (Number(m[1] || 0) * 24 * 60) + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return minutes > 0 ? minutes : undefined;
}

/** "4 portioner", "4-6 portioner" (-> 5), "4 personer", "ca 4" -> antal. Default 4. */
export function parsePortions(yieldValue) {
  const s = Array.isArray(yieldValue) ? yieldValue.join(" ") : String(yieldValue ?? "");
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:-|–|till)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/);
  if (!m) return DEFAULT_PORTIONS;
  let n = m[1] && m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[3]);
  if (!Number.isFinite(n) || n < 1 || n > 12) return DEFAULT_PORTIONS;
  return Math.round(n * 2) / 2;
}
