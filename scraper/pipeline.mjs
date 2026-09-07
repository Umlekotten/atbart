/**
 * Kör hela kedjan: discover -> scrape -> foods -> build. Allt cachas i .cache/, så en omkörning
 * hämtar bara det som saknas.
 */
import { discover } from "./discover.mjs";
import { scrape } from "./scrape.mjs";
import { foods } from "./foods.mjs";
import { build } from "./build.mjs";
import { selfTest } from "./ingredients.mjs";

const t0 = Date.now();
const step = (name) => console.log(`\n===== ${name} (${Math.round((Date.now() - t0) / 1000)} s) =====`);

step("självtest ingrediensparser");
if (!selfTest()) { console.error("Parserns självtest misslyckades."); process.exit(1); }
step("discover");
await discover();
step("scrape");
await scrape();
step("foods");
await foods();
step("build");
build();
step("klart");
