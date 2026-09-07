/**
 * Kurerad karta: ingrediensnamn (svenska, regex) -> Livsmedelsverkets livsmedelsnummer
 * + butikskategori, vikter per enhet och flaggor som styr anpassningarna.
 *
 * ORDNINGEN SPELAR ROLL: första träff vinner, så specifika mönster ("rödlök", "kokosmjölk",
 * "tomatpuré") ligger före generiska ("lök", "mjölk", "tomat").
 *
 * Fält:
 *   pattern         RegExp som testas mot det rensade, gemena ingrediensnamnet
 *   foodId          nummer i Livsmedelsverkets databas (null om `override` används)
 *   override        näring per 100 g för saker som saknas i databasen (uppskattning)
 *   category        StoreCategory från data/recipe-schema.ts
 *   gramsPerDl / gramsPerMsk / gramsPerTsk / gramsPerKrm  volym -> gram
 *   gramsPerSt / gramsPerKlyfta / gramsPerSkiva / gramsPerBit / gramsPerKnippe / gramsPerKruka / gramsPerKvist
 *   gramsPerForp    gram per förpackning/burk när recept skriver "1 förp"/"1 burk" utan vikt
 *   altPackaged     { foodId, gramsPerForp, drainedFactor, isCannedLegume } används när raden
 *                   säger burk/förp/konserv/kokta (t.ex. kikärter på burk i stället för torkade)
 *   altCount        { foodId, gramsPerSt } används när enheten är st/tärning (buljongtärning)
 *   flaggor         isSalt, isStock, isMeat, isSaltyCheese, isCharcuterie, isCannedLegume,
 *                   isSpiceMix, isSoySauce, isWater
 *   proteinSource   "fisk" | "fagel" | "kott" | "vegetariskt" | "agg-mejeri"
 */

const G = "gronsaker-frukt";
const K = "kott-fagel";
const F = "fisk-skaldjur";
const M = "mejeri-agg";
const S = "skafferi";
const KR = "kryddor-smaksattare";
const B = "brod";
const FR = "frys";
const O = "ovrigt";

/** Torkade kryddor: liten vikt, försumbar näring men litet protein/kalium. */
const SPICE = { protein: 10, salt: 0.1, kcal: 300, potassium: 1200, phosphorus: 200 };
const SPICE_UNITS = { gramsPerTsk: 2.5, gramsPerMsk: 7, gramsPerKrm: 0.5, gramsPerDl: 50, gramsPerSt: 0.3, gramsPerForp: 30, gramsPerNypa: 0.3 };
/** Färska örter */
const HERB = { protein: 2.5, salt: 0, kcal: 40, potassium: 500, phosphorus: 50 };
const HERB_UNITS = { gramsPerTsk: 1, gramsPerMsk: 3, gramsPerKrm: 0.3, gramsPerDl: 8, gramsPerKruka: 18, gramsPerKnippe: 20, gramsPerKvist: 1.5, gramsPerSt: 1.5, gramsPerBlad: 0.5 };
const LIQ = { gramsPerDl: 100, gramsPerMsk: 15, gramsPerTsk: 5, gramsPerKrm: 1 };
const OIL = { gramsPerDl: 92, gramsPerMsk: 14, gramsPerTsk: 4.6, gramsPerKrm: 0.9 };

const ENTRIES = [];
const LETTERS = "a-zåäöéüA-ZÅÄÖ";
/**
 * JavaScripts \b fungerar inte intill å/ä/ö ("\bägg\b" matchar aldrig "ägg"). Vi byter därför
 * \b före bokstav mot negativ lookbehind och \b efter bokstav mot negativ lookahead på svenska bokstäver.
 */
function swedishBoundaries(src) {
  return src
    .replace(/\\b(?=[a-zåäöéü])/g, `(?<![${LETTERS}])`)
    .replace(/(?<=[a-zåäöéü])\\b/g, `(?![${LETTERS}])`);
}
function add(pattern, foodId, category, opts = {}) {
  ENTRIES.push({ pattern: new RegExp(swedishBoundaries(pattern), "i"), foodId, category, ...opts });
}

// ---------------------------------------------------------------------------
// Vatten, buljong, fond
// ---------------------------------------------------------------------------
add("kokosvatten", 1591, S, { ...LIQ });
// Tidigt i kartan: bara rader som ÄR vatten. "tonfisk i vatten" ska matcha tonfisk, inte vatten.
add("^(?:kallt |varmt |hett |ljummet |kokande |kokhett )?(?:vatten|vattnet)$|^isbitar$|^is$", null, O, { isWater: true, ...LIQ, name: "Vatten" });
add("buljongtärning|buljongkub|tärning.*buljong|buljong.*tärning", 1217, KR, { isStock: true, gramsPerSt: 10, gramsPerMsk: 12, gramsPerTsk: 4, gramsPerDl: 80, gramsPerForp: 80 });
add("buljong|bouillon|dashi|hönsbuljong|kycklingbuljong|grönsaksbuljong|fiskbuljong|köttbuljong|kalvbuljong|oxbuljong|skaldjursbuljong|svampbuljong", 1223, KR, { isStock: true, ...LIQ, altCount: { foodId: 1217, gramsPerSt: 10 } });
add("fond(?!ue|ant)", null, KR, { isStock: true, override: { protein: 3, salt: 16, kcal: 60 }, name: "Fond, koncentrerad (uppskattat)", gramsPerMsk: 15, gramsPerTsk: 5, gramsPerDl: 100 });

// ---------------------------------------------------------------------------
// Soja/asiatiska såser och andra salta smaksättare (före sojabönor, fisk, tomat …)
// ---------------------------------------------------------------------------
add("edamame|sojabönor|gröna sojabönor", null, FR, { override: { protein: 11, salt: 0, kcal: 120, potassium: 430, phosphorus: 170 }, name: "Edamame/sojabönor (uppskattat)", gramsPerDl: 65, gramsPerForp: 400, proteinSource: "vegetariskt" });
add("sojafärs|sojaprotein|vegofärs|vegetarisk färs|veg\\.? ?färs|quorn|mykoprotein|oumph|pulled oats|växtfärs|vegansk färs|formbar färs|sojabitar|sojastrimlor|vegobitar", 2068, FR, { proteinSource: "vegetariskt", gramsPerDl: 50, gramsPerForp: 300 });
add("sojadryck|sojamjölk|havredryck|havremjölk|mandeldryck|mandelmjölk|risdryck|växtdryck|växtmjölk|oatly", 700, M, { ...LIQ });
add("sojagrädde|havregrädde|imat|vegansk grädde|växtbaserad grädde|matlagningsgrädde havre|grädde havre|kokosgrädde till matlagning", null, M, { override: { protein: 1, salt: 0.2, kcal: 150 }, name: "Havre-/sojagrädde (uppskattat)", ...LIQ });
add("sojasås|\\bsoja\\b|sojan|soya|shoyu|tamari|kikkoman", 909, KR, { isSoySauce: true, gramsPerDl: 115, gramsPerMsk: 17, gramsPerTsk: 6, gramsPerKrm: 1.2 });
add("fisksås|fish ?sauce|nam pla", 6675, KR, { isSoySauce: true, gramsPerDl: 120, gramsPerMsk: 18, gramsPerTsk: 6, gramsPerKrm: 1.2 });
add("ostronsås|oyster ?sauce", null, KR, { isSoySauce: true, override: { protein: 2, salt: 9, kcal: 100 }, name: "Ostronsås (uppskattat)", gramsPerDl: 120, gramsPerMsk: 18, gramsPerTsk: 6 });
add("teriyaki", 2012, KR, { isSoySauce: true, gramsPerDl: 115, gramsPerMsk: 17, gramsPerTsk: 6 });
add("hoisin", null, KR, { isSoySauce: true, override: { protein: 3, salt: 5, kcal: 220 }, name: "Hoisinsås (uppskattat)", gramsPerDl: 120, gramsPerMsk: 18, gramsPerTsk: 6 });
add("miso", 908, KR, { isSoySauce: true, gramsPerDl: 110, gramsPerMsk: 17, gramsPerTsk: 6 });
add("worcester", null, KR, { override: { protein: 0, salt: 3, kcal: 80 }, name: "Worcestershiresås (uppskattat)", ...LIQ });
add("sweet ?chili", 2007, KR, { gramsPerDl: 120, gramsPerMsk: 18, gramsPerTsk: 6 });
add("sambal|sriracha|srirracha|harissa|chilisås|chilipasta|chipotle(?! ?pulver)|gochujang|tabasco|chilipaste|ajika|hot ?sauce", null, KR, { override: { protein: 2, salt: 5, kcal: 90 }, name: "Chilisås/-pasta (uppskattat)", gramsPerDl: 110, gramsPerMsk: 16, gramsPerTsk: 5, gramsPerKrm: 1 });
add("currypasta|curry ?paste|röd curry|grön curry|gul curry|massaman|panang|tikka.*(pasta|paste)|tandoori.*(pasta|paste)|thai ?curry", null, KR, { override: { protein: 3, salt: 8, kcal: 130 }, name: "Currypasta (uppskattat)", gramsPerDl: 110, gramsPerMsk: 16, gramsPerTsk: 5 });
add("mango ?chutney|chutney", 6384, KR, { gramsPerDl: 130, gramsPerMsk: 20, gramsPerTsk: 7 });
add("wasabi", null, KR, { override: { protein: 3, salt: 3, kcal: 200 }, name: "Wasabi (uppskattat)", gramsPerTsk: 5, gramsPerMsk: 15 });
add("inlagd ingefära|picklad ingefära|gari\\b", null, KR, { override: { protein: 0.5, salt: 3, kcal: 50 }, name: "Inlagd ingefära (uppskattat)", gramsPerMsk: 15, gramsPerDl: 100 });
add("nori|kombu|wakame|alger|sjögräs", null, S, { override: { protein: 5, salt: 3, kcal: 30 }, name: "Alger (uppskattat)", gramsPerSt: 3, gramsPerMsk: 3 });

// ---------------------------------------------------------------------------
// Kryddor och kryddmixar. Ligger före kött/fisk/grönsaker så att "kycklingkrydda", "fiskkrydda",
// "paprikapulver", "lökpulver", "chiliflakes" inte fångas av kyckling/fisk/paprika/lök/chili.
// ---------------------------------------------------------------------------
add("citronpeppar|grillkrydda|kycklingkrydda|fiskkrydda|köttkrydda|allkrydda|aromat|tacokrydda|taco-krydda|taco ?krydd|fajitakrydda|fajita ?krydd|kryddmix|kryddblandning|cajunkrydda|cajun|kebabkrydda|gyroskrydda|pizzakrydda|pommes ?krydda|potatiskrydda|jerk|shawarmakrydda|kryddpåse|krydda till|kryddsalt|vitlökssalt|sellerisalt|lökssalt|tikka masala krydda|tandoorikrydda|tandoori ?krydd|kryddor till taco|texmex", 5973, KR, { isSpiceMix: true, gramsPerMsk: 8, gramsPerTsk: 3, gramsPerKrm: 0.6, gramsPerForp: 28, gramsPerDl: 55 });
add("örtsalt|kryddsalt", 1978, KR, { isSalt: true, gramsPerTsk: 5, gramsPerMsk: 15, gramsPerKrm: 1, gramsPerNypa: 0.5, gramsPerDl: 100 });
add("paprikapulver|rökt paprika|paprika pulver|paprikakrydda|pimentón|piment|paprika, rökt", null, KR, { override: SPICE, name: "Paprikapulver (uppskattat)", ...SPICE_UNITS });
add("vitlökspulver|lökpulver|vitlöksgranulat|vitlökspasta", null, KR, { override: SPICE, name: "Lök-/vitlökspulver (uppskattat)", ...SPICE_UNITS });
add("chiliflakes|chilipulver|chilipeppar torkad|torkad chili|cayenne|chilikrydda|chipotle ?pulver|krossad chili|chili ?flakes|chili flakes|torkade chiliflakes|chilifrön|ancho|pul biber|piri ?piri|urfa", null, KR, { override: SPICE, name: "Chilipulver/-flakes (uppskattat)", ...SPICE_UNITS });
add("malen ingefära|ingefära pulver|torkad ingefära|ingefärspulver|ingefära, malen", null, KR, { override: SPICE, name: "Malen ingefära (uppskattat)", ...SPICE_UNITS });
add("gurkmeja|turmeric", 7198, KR, { ...SPICE_UNITS });
add("spiskummin|kummin|cumin|jeera", 7199, KR, { ...SPICE_UNITS });
add("korianderfrö|malen koriander|torkad koriander|koriander, malen|korianderfrön", 7197, KR, { ...SPICE_UNITS });
add("kanel|kanelstång", 2306, KR, { ...SPICE_UNITS, gramsPerSt: 2 });
add("kardemumma", 7195, KR, { ...SPICE_UNITS });
add("muskot", 6666, KR, { ...SPICE_UNITS });
add("nejlika|kryddnejlika", 7196, KR, { ...SPICE_UNITS, gramsPerSt: 0.1 });
add("garam masala|currypulver|\\bcurry\\b|madras|ras el hanout|za'?atar|baharat|dukkah|sumak|berbere|kryddpeppar|svartpeppar|vitpeppar|grönpeppar|rosépeppar|pepparkorn|nymalen peppar|grovmalen peppar|\\bpeppar\\b|pepparn|sichuanpeppar|szechuan|femkryddor|five spice|lagerblad|enbär|senapsfrön|fänkålsfrön|\\banis\\b|stjärnanis|kryddnejlikor|saffran|vanilj|dillfrön|torkade örter|torkad oregano|torkad timjan|torkad basilika|torkad rosmarin|italienska örter|provencalska örter|herbes de provence|oregano|timjan|rosmarin|mejram|dragon|salvia|\\bkryddor\\b|\\bkrydda\\b|kryddblandning|bouquet garni|smoked|liquid smoke|nigella|bockhornsklöver|fenugreek|kaffirlime|curryblad|galangal|tamarind|sichuan", null, KR, { override: SPICE, name: "Torkad krydda/ört (uppskattat)", ...SPICE_UNITS, gramsPerKvist: 1, gramsPerKruka: 15, gramsPerKnippe: 15 });

// ---------------------------------------------------------------------------
// Tomatprodukter, ketchup, senap, majonnäs, pesto m.m.
// ---------------------------------------------------------------------------
add("tomatpuré|tomatpure|tomatkoncentrat", 410, S, { gramsPerMsk: 15, gramsPerTsk: 5, gramsPerDl: 100, gramsPerForp: 140 });
add("soltorkade tomater|soltorkad tomat|semitorkade tomater", 365, S, { gramsPerSt: 3, gramsPerDl: 60, gramsPerForp: 200, gramsPerMsk: 10 });
add("tomatsås|pastasås|pizzasås|marinara|arrabiata", 461, S, { ...LIQ, gramsPerForp: 400 });
add("krossade tomater|krossad tomat|passerade tomater|passerad tomat|tomater på burk|tomater i burk|hela tomater|tomatkross|passata|konserverade tomater|tomater konserv|burktomater|körsbärstomater på burk|tomater, krossade|krossade tomat", 422, S, { gramsPerDl: 100, gramsPerForp: 400 });
add("körsbärstomat|cocktailtomat|minitomat|små tomater|plommontomat|romantomat|kvisttomat", 4937, G, { gramsPerSt: 15, gramsPerDl: 60, gramsPerForp: 250 });
add("tomatjuice", 408, S, { ...LIQ });
add("tomat", 364, G, { gramsPerSt: 120, gramsPerDl: 60 });
add("ketchup", 1969, KR, { gramsPerMsk: 17, gramsPerTsk: 6, gramsPerDl: 110 });
add("senapsfrö|senapspulver|senapskorn", null, KR, { override: SPICE, name: "Senapsfrö (uppskattat)", ...SPICE_UNITS });
add("dijon|fransk senap|grovkornig senap|senap(?!s?sill)|mustard", 1973, KR, { gramsPerMsk: 15, gramsPerTsk: 5, gramsPerDl: 100 });
add("majonnäs|majonäs|mayo|aioli|vitlöksmajonnäs", 50, KR, { gramsPerMsk: 14, gramsPerTsk: 5, gramsPerDl: 95 });
add("pesto", 2004, KR, { gramsPerMsk: 15, gramsPerTsk: 5, gramsPerDl: 100, gramsPerForp: 190 });
add("ajvar", null, KR, { override: { protein: 1.5, salt: 2, kcal: 90 }, name: "Ajvar (uppskattat)", gramsPerMsk: 16, gramsPerDl: 105, gramsPerForp: 300 });
add("hummus", 3051, S, { gramsPerMsk: 15, gramsPerDl: 100, gramsPerForp: 250, proteinSource: "vegetariskt" });
add("tzatziki|tsatsiki", null, M, { override: { protein: 3.5, salt: 0.9, kcal: 90 }, name: "Tzatziki (uppskattat)", gramsPerMsk: 15, gramsPerDl: 100, gramsPerForp: 250 });
add("guacamole", null, G, { override: { protein: 2, salt: 0.8, kcal: 150 }, name: "Guacamole (uppskattat)", gramsPerMsk: 15, gramsPerDl: 100, gramsPerForp: 250 });
add("salsa", 462, KR, { gramsPerMsk: 15, gramsPerDl: 100, gramsPerForp: 230 });
add("bearnaise", 58, KR, { ...LIQ, gramsPerForp: 200 });
add("hollandaise", 59, KR, { ...LIQ, gramsPerForp: 200 });
add("remoulad", 25, KR, { gramsPerMsk: 14, gramsPerDl: 95 });
add("kapris|kaprisbär", null, KR, { override: { protein: 2.4, salt: 6, kcal: 25, potassium: 40, phosphorus: 10 }, name: "Kapris (uppskattat)", gramsPerMsk: 9, gramsPerTsk: 3, gramsPerDl: 60, gramsPerForp: 60 });
add("cornichon|inlagd gurka|inlagda gurkor|ättiksgurka|saltgurka|smörgåsgurka|pickles|picklad gurka|västeråsgurka", 491, KR, { gramsPerSt: 10, gramsPerDl: 60, gramsPerMsk: 12, gramsPerForp: 200 });
add("bostongurka", 488, KR, { gramsPerMsk: 15, gramsPerDl: 100 });
add("oliver|svarta oliver|gröna oliver|kalamata|oliv\\b", 402, S, { gramsPerSt: 4, gramsPerDl: 60, gramsPerMsk: 10, gramsPerForp: 150 });

// ---------------------------------------------------------------------------
// Mejeri (specifikt före generiskt: kokosmjölk/havremjölk ligger ovan)
// ---------------------------------------------------------------------------
add("crème fraiche|creme fraiche|cremefraiche|crème fraîche|creme fraîche|smetana", 1719, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerTsk: 5, gramsPerForp: 200 });
add("gräddfil", 1713, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 200 });
add("turkisk yoghurt|grekisk yoghurt|yoghurt 10|matyoghurt|yoghurt, turkisk|turkisk", 6113, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 500 });
add("yoghurt|yogurt|naturell yoghurt", 124, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 500 });
add("kvarg|kesella", 76, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 250 });
add("cottage cheese|keso", 70, M, { gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 250 });
add("filmjölk|\\bfil\\b|a-fil", null, M, { override: { protein: 3.4, salt: 0.1, kcal: 60, potassium: 150, phosphorus: 100 }, name: "Filmjölk (uppskattat)", ...LIQ });
add("mascarpone", null, M, { override: { protein: 4.5, salt: 0.1, kcal: 430, potassium: 100, phosphorus: 120 }, name: "Mascarpone (uppskattat)", gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 250 });
add("ricotta", null, M, { override: { protein: 9, salt: 0.3, kcal: 150, potassium: 120, phosphorus: 160 }, name: "Ricotta (uppskattat)", gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 250 });
add("färskost|philadelphia|kräm ?ost|cream cheese|bredbar ost", null, M, { override: { protein: 5.5, salt: 0.8, kcal: 250, potassium: 130, phosphorus: 100 }, name: "Färskost (uppskattat)", gramsPerDl: 100, gramsPerMsk: 15, gramsPerForp: 200 });
add("kokosmjölk|kokosgrädde|coconut", 1590, S, { ...LIQ, gramsPerForp: 400 });
add("vispgrädde|grädde 40|vispad grädde|tjock grädde", 1715, M, { ...LIQ, gramsPerForp: 300 });
add("matlagningsgrädde|grädde 15|kaffegrädde|matgrädde|kokgrädde|mellangrädde|lätt grädde", 1717, M, { ...LIQ, gramsPerForp: 250 });
add("grädde", 1715, M, { ...LIQ, gramsPerForp: 300 });
add("mellanmjölk|lättmjölk|standardmjölk|mjölk|minimjölk", 150, M, { gramsPerDl: 103, gramsPerMsk: 15, gramsPerTsk: 5, gramsPerForp: 1000 });
add("bregott|smör- ?(och|&) ?rapsolja|flytande margarin|margarin|matfett|milda|lätta\\b", 4662, M, { gramsPerMsk: 14, gramsPerTsk: 5, gramsPerDl: 95, gramsPerForp: 500 });
add("jordnötssmör|peanut ?butter", 1559, S, { gramsPerMsk: 16, gramsPerTsk: 6, gramsPerDl: 105, proteinSource: "vegetariskt" });
add("mandelsmör|cashewsmör|tahini|sesampasta|nötsmör", null, S, { override: { protein: 17, salt: 0.1, kcal: 600, potassium: 400, phosphorus: 700 }, name: "Tahini/nötsmör (uppskattat)", gramsPerMsk: 16, gramsPerTsk: 6, gramsPerDl: 105 });
add("smördeg|filodeg|pajdeg|pizzadeg", null, B, { override: { protein: 6, salt: 1, kcal: 400, potassium: 100, phosphorus: 80 }, name: "Smördeg/deg (uppskattat)", gramsPerForp: 400, gramsPerSt: 40, gramsPerSkiva: 40, gramsPerBlad: 20 });
add("smör(?!bön|deg|gås|kräm)|ghee", 29, M, { gramsPerMsk: 14, gramsPerTsk: 5, gramsPerKrm: 1, gramsPerDl: 95, gramsPerForp: 500 });

// Ostar
add("halloumi|grillost", 100, M, { isSaltyCheese: true, proteinSource: "agg-mejeri", gramsPerForp: 200, gramsPerSt: 200, gramsPerSkiva: 25, gramsPerDl: 60 });
add("fetaost|\\bfeta\\b|salladsost|grekisk ost|fårost|getost|chèvre|chevre|vit ost i saltlake", 94, M, { isSaltyCheese: true, proteinSource: "agg-mejeri", gramsPerForp: 150, gramsPerSt: 150, gramsPerDl: 60, gramsPerMsk: 10, gramsPerSkiva: 15 });
add("parmesan|parmigiano|grana padano|pecorino|västerbotten|lagrad ost|riven lagrad", 103, M, { isSaltyCheese: true, proteinSource: "agg-mejeri", gramsPerDl: 35, gramsPerMsk: 6, gramsPerTsk: 2, gramsPerForp: 150, gramsPerSt: 150 });
add("mozzarella|burrata|buffelmozzarella", 2255, M, { proteinSource: "agg-mejeri", gramsPerForp: 125, gramsPerSt: 125, gramsPerDl: 45, gramsPerSkiva: 15 });
add("ädelost|gorgonzola|blåmögelost|roquefort|stilton|mögelost|grönmögel|blå ost", 82, M, { isSaltyCheese: true, proteinSource: "agg-mejeri", gramsPerDl: 50, gramsPerMsk: 8, gramsPerForp: 150, gramsPerSt: 150 });
add("brie|camembert|vitmögel", 92, M, { proteinSource: "agg-mejeri", gramsPerForp: 150, gramsPerSt: 150, gramsPerSkiva: 15 });
add("cheddar|gruyère|gruyere|manchego|emmentaler|grevé|greve\\b|herrgård|hushållsost|prästost|riven ost|hårdost|smältost|\\bost\\b|ostskivor|skivad ost|hyvlad ost|osten\\b|ostar\\b|gratängost|pizzaost|cheese|comté|taleggio|fontina|provolone|gouda|edamer|port salut", 96, M, { proteinSource: "agg-mejeri", gramsPerDl: 40, gramsPerMsk: 7, gramsPerSkiva: 20, gramsPerForp: 500, gramsPerSt: 500 });

// Ägg (efter äggnudlar/äggplanta, se nedan – aubergine ligger före)
add("aubergine|äggplanta|eggplant", 372, G, { gramsPerSt: 300 });
add("äggula|äggulor", 1226, M, { gramsPerSt: 18, proteinSource: "agg-mejeri" });
add("äggvita|äggvitor", 1227, M, { gramsPerSt: 33, proteinSource: "agg-mejeri" });
add("\\bägg\\b|äggen", 1225, M, { gramsPerSt: 58, proteinSource: "agg-mejeri" });

// ---------------------------------------------------------------------------
// Oljor, vinäger, sött
// ---------------------------------------------------------------------------
add("sesamolja", 38, KR, { ...OIL });
add("kokosolja|kokosfett", 6165, S, { ...OIL });
add("olivolja|olive oil|jungfruolja|extra virgin", 35, S, { ...OIL });
add("rapsolja|solrosolja|matolja|neutral olja|frityrolja|\\bolja\\b|oljan|\\boil\\b|majsolja|jordnötsolja|chiliolja|vitlöksolja|tryffelolja", 2189, S, { ...OIL });
add("balsamvinäger|balsamico|balsam", null, KR, { override: { protein: 0.5, salt: 0.1, kcal: 90 }, name: "Balsamvinäger (uppskattat)", gramsPerMsk: 16, gramsPerTsk: 5, gramsPerDl: 105 });
add("äppelcidervinäger|cidervinäger", 1967, KR, { ...LIQ });
add("vinäger|risvinäger|vitvinsvinäger|rödvinsvinäger|sherryvinäger|ättika|ättiksprit|vinägersprit|champagnevinäger", 1966, KR, { ...LIQ });
add("honung(?!smelon)", 1896, S, { gramsPerMsk: 21, gramsPerTsk: 7, gramsPerDl: 140 });
add("lönnsirap|sirap|agave|golden syrup|dadelsirap", null, S, { override: { protein: 0, salt: 0.05, kcal: 300 }, name: "Sirap (uppskattat)", gramsPerMsk: 20, gramsPerTsk: 7, gramsPerDl: 140 });
add("sockerärtor|sugar ?snaps|sockerärter", 359, G, { gramsPerDl: 60, gramsPerForp: 200 });
add("strösocker|socker|farinsocker|rörsocker|muscovado|florsocker|kokossocker|palmsocker|råsocker|sugar", 1892, S, { gramsPerMsk: 13, gramsPerTsk: 4, gramsPerKrm: 0.8, gramsPerDl: 85 });
add("bakpulver|bikarbonat", null, S, { override: { protein: 0, salt: 25, kcal: 100 }, name: "Bakpulver/bikarbonat (uppskattat)", gramsPerTsk: 4, gramsPerMsk: 12, gramsPerKrm: 0.8 });
add("torrjäst|jäst", null, S, { override: { protein: 12, salt: 0, kcal: 100 }, name: "Jäst (uppskattat)", gramsPerForp: 50, gramsPerMsk: 10, gramsPerTsk: 3 });

// ---------------------------------------------------------------------------
// Mjöl, ris, pasta, gryn
// ---------------------------------------------------------------------------
add("potatismjöl|majsstärkelse|maizena|potatisstärkelse|redningsmjöl|majsmjöl|stärkelse", 1946, S, { gramsPerDl: 65, gramsPerMsk: 10, gramsPerTsk: 3 });
add("ströbröd|panko|brödsmulor", 188, S, { gramsPerDl: 50, gramsPerMsk: 8, gramsPerTsk: 3 });
add("kikärtsmjöl|mandelmjöl|kokosmjöl", 881, S, { gramsPerDl: 55, gramsPerMsk: 8 });
add("vetemjöl|\\bmjöl\\b|mjölet|durumvete|dinkelmjöl|rågmjöl|grahamsmjöl|fullkornsmjöl|speltmjöl|semolina", 1941, S, { gramsPerDl: 60, gramsPerMsk: 9, gramsPerTsk: 3 });
add("jasminris|jasmin", 2477, S, { gramsPerDl: 85, gramsPerForp: 1000 });
add("basmatiris|basmati", 2475, S, { gramsPerDl: 85, gramsPerForp: 1000 });
add("kokt ris|kallt ris|färdigkokt ris|rester av ris", 814, S, { gramsPerDl: 75 });
add("risottoris|arborio|carnaroli|avorio|grötris|rundkornigt ris|sushiris|paellaris|bomba|fullkornsris|råris|brunt ris|naturris|vildris|långkornigt ris|\\bris\\b|riset|matris|rismix", 2475, S, { gramsPerDl: 85, gramsPerForp: 1000 });
add("risnudlar|glasnudlar|rispapper", 4447, S, { gramsPerDl: 40, gramsPerForp: 250, gramsPerSt: 60 });
add("äggnudlar|nudlar|ramen|udon|soba|noodles|snabbnudlar", 870, S, { gramsPerDl: 40, gramsPerForp: 250, gramsPerSt: 85 });
add("lasagneplattor|lasagnette|lasagneblad|lasagneark", 845, S, { gramsPerSt: 18, gramsPerForp: 500 });
add("färsk pasta|tortellini|ravioli|gnocchi|tortelloni|cappelletti", null, S, { override: { protein: 11, salt: 0.6, kcal: 280, potassium: 150, phosphorus: 150 }, name: "Färsk pasta/gnocchi (uppskattat)", gramsPerForp: 400, gramsPerDl: 70 });
add("(?<!curry|chili|sesam|miso|vitlöks|ansjovis|tamarind|räk|bön|tomat)pasta|spaghetti|spagetti|penne|tagliatelle|linguine|fusilli|farfalle|rigatoni|makaroner|fettuccine|pappardelle|orzo|bucatini|conchiglie|casarecce|gemelli|fusilloni|paccheri|mezze|tortiglioni|orecchiette|risoni|cannelloni", 845, S, { gramsPerDl: 45, gramsPerForp: 500 });
add("couscous", 831, S, { gramsPerDl: 70, gramsPerForp: 500 });
add("bulgur|matvete|mathavre|matkorn|dinkel|korngryn|helvete|pärlcouscous|freekeh|farro", 829, S, { gramsPerDl: 75, gramsPerForp: 500 });
add("quinoa", 7025, S, { gramsPerDl: 80, gramsPerForp: 500 });
add("polenta|majsgryn", 6872, S, { gramsPerDl: 70 });
add("havregryn|\\bhavre\\b", 702, S, { gramsPerDl: 40, gramsPerMsk: 6 });

// ---------------------------------------------------------------------------
// Baljväxter, tofu, vegetariska proteiner
// ---------------------------------------------------------------------------
add("röda linser|rödlinser|linser röda|linser, röda", 884, S, { proteinSource: "vegetariskt", gramsPerDl: 85, gramsPerForp: 500, altPackaged: { foodId: 3823, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("gröna linser|svarta linser|beluga|puylinser|linser|\\blins\\b|belugalinser|bruna linser|gula linser", 884, S, { proteinSource: "vegetariskt", gramsPerDl: 85, gramsPerForp: 500, altPackaged: { foodId: 3824, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("kikärt|kikärtor|kikärter|chickpea", 881, S, { proteinSource: "vegetariskt", gramsPerDl: 75, gramsPerForp: 400, defaultPackaged: true, altPackaged: { foodId: 3815, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("kidneybönor|kidney|röda bönor", 877, S, { proteinSource: "vegetariskt", gramsPerDl: 80, gramsPerForp: 400, defaultPackaged: true, altPackaged: { foodId: 3816, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("svarta bönor|black beans", 877, S, { proteinSource: "vegetariskt", gramsPerDl: 80, gramsPerForp: 400, defaultPackaged: true, altPackaged: { foodId: 3817, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("gröna bönor|haricots? ?verts|brytbönor|bönor gröna|sparrisbönor|vaxbönor", 331, FR, { gramsPerDl: 60, gramsPerForp: 400, gramsPerSt: 6 });
add("bondbönor|favabönor|fava", 324, S, { proteinSource: "vegetariskt", gramsPerDl: 70, gramsPerForp: 400 });
add("vita bönor|stora vita bönor|cannellini|butter ?beans|borlotti|bönor i tomatsås|bruna bönor|bönmix|blandade bönor|bönor|bönröra|limabönor|pintobönor|mungbönor|adzuki|\\bböna\\b", 879, S, { proteinSource: "vegetariskt", gramsPerDl: 80, gramsPerForp: 400, defaultPackaged: true, altPackaged: { foodId: 3761, gramsPerForp: 400, drainedFactor: 0.6, isCannedLegume: true } });
add("gröna ärtor|ärtor|ärter|frysta ärtor|gula ärtor|ärtsoppa", 374, FR, { gramsPerDl: 65, gramsPerForp: 400 });
add("majskolv", 345, G, { gramsPerSt: 250 });
add("majskorn|\\bmajs\\b|majsen|krispig majs", 347, FR, { gramsPerDl: 70, gramsPerForp: 300, altPackaged: { foodId: 400, gramsPerForp: 300, drainedFactor: 0.7, isCannedLegume: true } });
add("tofu", 905, S, { proteinSource: "vegetariskt", gramsPerForp: 300, gramsPerSt: 300, gramsPerDl: 100 });
add("tempeh|seitan", null, S, { override: { protein: 19, salt: 0.1, kcal: 190, potassium: 400, phosphorus: 250 }, name: "Tempeh/seitan (uppskattat)", proteinSource: "vegetariskt", gramsPerForp: 200, gramsPerSt: 200 });
add("falafel", 2064, FR, { proteinSource: "vegetariskt", gramsPerSt: 20, gramsPerForp: 400 });
add("vegetariska biffar|grönsaksbiffar|vegobiffar|vegoburgare|vegetarisk burgare|veggieburgare|bönburgare|sojabiffar|vegobiff|vegetarisk biff|växtbaserad burgare|halloumiburgare", 6379, FR, { proteinSource: "vegetariskt", gramsPerSt: 80, gramsPerForp: 400 });
add("vegokorv|vegetarisk korv|sojakorv|vegankorv|växtbaserad korv", 916, FR, { proteinSource: "vegetariskt", gramsPerSt: 60, gramsPerForp: 300 });
add("vegetariska köttbullar|vegobullar|vegetariska bullar|sojabullar", 6272, FR, { proteinSource: "vegetariskt", gramsPerSt: 15, gramsPerForp: 400 });

// ---------------------------------------------------------------------------
// Fågel
// ---------------------------------------------------------------------------
add("kycklingkorv|kalkonkorv", 1485, K, { isCharcuterie: true, proteinSource: "fagel", gramsPerSt: 60, gramsPerForp: 300 });
add("rökt kalkon|kalkonpålägg|kalkonbröst rökt", 6009, K, { isCharcuterie: true, proteinSource: "fagel", gramsPerSkiva: 12, gramsPerForp: 120 });
add("kycklingfärs|kalkonfärs", 1164, K, { proteinSource: "fagel", gramsPerForp: 500 });
add("kycklinglårfilé|lårfilé|kycklinglår|kyckling.*lår|kycklingklubb|kycklingben|kycklingvinge|kycklingvingar", 1167, K, { proteinSource: "fagel", gramsPerSt: 100, gramsPerForp: 700 });
add("kycklingfilé|kycklingbröst|kycklingbröstfilé|bröstfilé|kycklingfiléer|kycklingfile|kycklinginnerfilé|innerfilé", 1166, K, { proteinSource: "fagel", gramsPerSt: 150, gramsPerForp: 700 });
add("hel kyckling|grillad kyckling|kyckling, hel|kyckling hel|majskyckling", 1164, K, { proteinSource: "fagel", gramsPerSt: 700, gramsPerForp: 700 });
add("kyckling|höna|hönskött|pulled chicken|kycklingstrimlor|kycklingkött", 1164, K, { proteinSource: "fagel", gramsPerSt: 150, gramsPerForp: 700 });
add("kalkon|kalkonfilé|kalkonbröst|kalkonschnitzel", 1162, K, { proteinSource: "fagel", gramsPerSt: 150, gramsPerForp: 500 });
add("anka|ankbröst|anklår", 1151, K, { proteinSource: "fagel", gramsPerSt: 300 });

// ---------------------------------------------------------------------------
// Chark (före generiskt kött)
// ---------------------------------------------------------------------------
add("bacon|pancetta|sidfläsk|fläsksida|guanciale|rimmat fläsk|rökt fläsk", 1003, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSkiva: 15, gramsPerForp: 140, gramsPerSt: 15 });
add("chorizo|salsiccia|merguez", 1513, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSt: 80, gramsPerForp: 300, gramsPerSkiva: 8 });
add("falukorv", 1487, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSt: 800, gramsPerForp: 800, gramsPerSkiva: 20 });
add("prinskorv|kabanoss|grillkorv|wienerkorv|varmkorv|isterband|fläskkorv|köttkorv|bratwurst|kryddkorv|salami|pepperoni|chipolata|frankfurter|ölkorv|lammkorv|\\bkorv\\b|korvar|korven|chistorra|kielbasa|kålkorv|medvurst|nduja", 1487, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSt: 60, gramsPerForp: 300, gramsPerSkiva: 10 });
add("parmaskinka|serranoskinka|serrano ?skinka|jamón|lufttorkad skinka|prosciutto|coppa|bresaola|lufttorkad", 1008, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSkiva: 12, gramsPerForp: 80 });
add("kassler", 1006, K, { isCharcuterie: true, proteinSource: "kott", gramsPerSkiva: 40, gramsPerForp: 500 });
add("rökt skinka|kokt skinka|skinka|julskinka|pastrami|rimmad|rökt kött|rökt bringa|corned beef", null, K, { isCharcuterie: true, proteinSource: "kott", override: { protein: 18, salt: 2.3, kcal: 110, potassium: 300, phosphorus: 220 }, name: "Skinka, kokt/rökt (uppskattat)", gramsPerSkiva: 15, gramsPerForp: 150 });
add("kebabkött|kebab|gyros|shawarma|doner", null, K, { isCharcuterie: true, proteinSource: "kott", override: { protein: 17, salt: 2, kcal: 220, potassium: 250, phosphorus: 150 }, name: "Kebabkött (uppskattat)", gramsPerForp: 500 });
add("köttbullar|färdiga köttbullar|frikadeller|kycklingbullar", 1106, K, { proteinSource: "kott", gramsPerSt: 15, gramsPerForp: 500 });
add("hamburgare|nötburgare|burgare|köttfärsburgare|hamburgerbiff|hamburgerbiffar|biffar till hamburgare", 951, K, { proteinSource: "kott", gramsPerSt: 120, gramsPerForp: 480 });
add("leverpastej|lever\\b|kycklinglever|kalvlever", null, K, { proteinSource: "kott", override: { protein: 20, salt: 0.2, kcal: 135, potassium: 300, phosphorus: 360 }, name: "Lever (uppskattat)", gramsPerForp: 400 });

// ---------------------------------------------------------------------------
// Kött
// ---------------------------------------------------------------------------
add("lammfärs", 925, K, { proteinSource: "kott", gramsPerForp: 500 });
add("fläskfärs|grisfärs", 951, K, { proteinSource: "kott", gramsPerForp: 500 });
add("viltfärs|älgfärs|renfärs|hjortfärs", 995, K, { proteinSource: "kott", gramsPerForp: 500 });
add("köttfärs|nötfärs|blandfärs|\\bfärs\\b|färsen|köttfärsen|högrevsfärs|kalvfärs|färsbiff|färsrull|färslimp|färssås", 951, K, { proteinSource: "kott", gramsPerForp: 500 });
add("fläskkarré|karré|fläskbog|bogfläsk|pulled pork|fläskstek|skinkstek|grisstek", 978, K, { proteinSource: "kott", gramsPerSt: 150, gramsPerForp: 1000 });
add("fläskfilé|fläskytterfilé|ytterfilé|grisfilé", 970, K, { proteinSource: "kott", gramsPerSt: 500, gramsPerForp: 500 });
add("lammkotlett|lammracks|lammrack|lammkotletter", 921, K, { proteinSource: "kott", gramsPerSt: 80 });
add("fläskkotlett|kotlett|kotletter|benfri kotlett|fläskschnitzel|schnitzel", 971, K, { proteinSource: "kott", gramsPerSt: 150 });
add("revben|revbensspjäll|spareribs|ribs\\b|tjocka revben|kamben", 978, K, { proteinSource: "kott", gramsPerForp: 1000 });
add("fläskkött|fläsk\\b|griskött|gris\\b|fläskbit|fläskstrimlor|karrestrimlor|fläsklägg|lägg\\b", 978, K, { proteinSource: "kott", gramsPerForp: 500 });
add("lammstek|lammbog|lammlägg|lammkött|lammytterfilé|lammfilé|lammsadel|lammracks|lamm\\b|lammgrytbitar|lamminnanlår|lammrostbiff|lammentrecote|lammentrecôte|lamm", 924, K, { proteinSource: "kott", gramsPerSt: 150, gramsPerForp: 800 });
add("högrev|grytbitar|nötgrytbitar|bog\\b|nötbog|märgpipa|oxbog|oxkind|kalvkind|kalops", 953, K, { proteinSource: "kott", gramsPerForp: 800 });
add("oxfilé|ryggbiff|entrecote|entrecôte|biff\\b|biffar|rostbiff|innanlår|ytterlår|fransyska|nötkött|nöt\\b|oxkött|oxbringa|bringa|kalvkött|kalv\\b|kalvfilé|kalvschnitzel|lövbiff|flankstek|nötstek|oxrulad|oxsvans|rostas|flap steak|picanha|nötrulle|kalvytterfilé|kalvinnanlår|kalvrostbiff|nötinnanlår|nötytterfilé|black angus|angus|hängmörad|t-bone|tomahawk|bavette|\\bkött\\b|köttet|grytkött", 946, K, { proteinSource: "kott", gramsPerSt: 180, gramsPerForp: 500 });
add("älgkött|älgstek|älg\\b|renskav|renkött|\\bren\\b|hjort|rådjur|vildsvin|vilt\\b|viltskav|viltkött|dovhjort|kronhjort|älgskav|renstek", 995, K, { proteinSource: "kott", gramsPerForp: 500 });

// ---------------------------------------------------------------------------
// Fisk och skaldjur
// ---------------------------------------------------------------------------
add("fiskpinnar", 1294, FR, { proteinSource: "fisk", gramsPerSt: 28, gramsPerForp: 450 });
add("fiskbullar", 1345, F, { proteinSource: "fisk", gramsPerForp: 375, gramsPerSt: 20 });
add("skagenröra|räksallad|räkröra", 3873, F, { proteinSource: "fisk", gramsPerForp: 200, gramsPerDl: 100 });
add("kaviar|löjrom|stenbitsrom|\\brom\\b|forellrom|laxrom|sikrom|romsås", null, F, { override: { protein: 12, salt: 8, kcal: 200, potassium: 150, phosphorus: 300 }, name: "Kaviar/rom (uppskattat)", gramsPerMsk: 15, gramsPerTsk: 5, gramsPerForp: 80 });
add("ansjovis|sardeller|anchovies", 1265, F, { isCharcuterie: true, proteinSource: "fisk", gramsPerSt: 4, gramsPerForp: 100, gramsPerMsk: 15 });
add("gravad lax|gravlax|gravad", 1285, F, { proteinSource: "fisk", gramsPerSkiva: 15, gramsPerForp: 200 });
add("varmrökt lax|varmrökt", 1288, F, { proteinSource: "fisk", gramsPerForp: 250, gramsPerSt: 125 });
add("rökt lax|kallrökt lax|kallrökt|rökt laxfilé|rökt regnbåge|rökt öring", 1269, F, { proteinSource: "fisk", gramsPerSkiva: 15, gramsPerForp: 200 });
add("laxfilé|laxsida|laxbit|laxrygg|laxfiléer|regnbåge|regnbågslax|\\blax\\b|laxen|laxkotlett|laxtärningar|laxstrimlor|fjordlax", 1255, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 500 });
add("röding|öring|fjällröding|rödingfilé", 1244, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 500 });
add("torskrygg|torskfilé|torsk|torskbit|torskfiléer", 1246, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("sejfilé|\\bsej\\b|sejrygg", 1202, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("kolja|koljafilé|koljarygg", 1237, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("tonfisk|tuna", 1278, F, { proteinSource: "fisk", gramsPerForp: 120, gramsPerSt: 120 });
add("makrill|makrillfilé", 1260, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("rödspätta|spätta|flundra|hälleflundra|piggvar|sjötunga|rödtunga|bergtunga", 1258, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("abborre|abborrfilé", 1253, F, { proteinSource: "fisk", gramsPerSt: 100, gramsPerForp: 400 });
add("gös|gösfilé", 1263, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("strömming|strömmingsfilé|böckling", 1243, F, { proteinSource: "fisk", gramsPerSt: 40, gramsPerForp: 400 });
add("matjes|matjessill|inlagd sill|senapssill|\\bsill\\b|sillfilé|sillen", 4608, F, { isCharcuterie: true, proteinSource: "fisk", gramsPerSt: 60, gramsPerForp: 240 });
add("sardiner|sardin", 1271, F, { proteinSource: "fisk", gramsPerForp: 90, gramsPerSt: 15 });
add("hoki|alaska pollock|pollock|kummel|marulk|havskatt|lutfisk|\\bsik\\b|gädda|braxen|vit fisk|vitfisk|vit fiskfilé|fiskfilé|fiskfiléer|fiskfärs|fiskblock|\\bfisk\\b|fisken|fiskbit|fiskkött|fisk i bitar", 1246, F, { proteinSource: "fisk", gramsPerSt: 150, gramsPerForp: 400 });
add("räkor|räka|scampi|tigerräkor|jätteräkor|kungsräkor|skalade räkor|räkorna|räkstjärtar|shrimp|prawn", 1395, F, { proteinSource: "fisk", gramsPerDl: 60, gramsPerForp: 250, gramsPerSt: 10 });
add("kräftstjärtar|kräftor|kräfta|signalkräftor|havskräftor|havskräfta|langustin", 1394, F, { proteinSource: "fisk", gramsPerForp: 200, gramsPerSt: 15, gramsPerDl: 60 });
add("hummer", 1393, F, { proteinSource: "fisk", gramsPerSt: 300 });
add("krabba|krabbkött|krabbklor", 1397, F, { proteinSource: "fisk", gramsPerForp: 150, gramsPerSt: 300 });
add("crabfish|surimi|fiskpinne", null, F, { override: { protein: 8, salt: 1.8, kcal: 90 }, name: "Crabfish/surimi (uppskattat)", proteinSource: "fisk", gramsPerForp: 250, gramsPerSt: 15 });
add("bläckfisk|calamari|tioarmad|åttaarmad|octopus|squid", 1384, F, { proteinSource: "fisk", gramsPerForp: 400 });
add("pilgrimsmusslor|pilgrimsmussla|kammusslor", null, F, { override: { protein: 17, salt: 0.4, kcal: 90, potassium: 300, phosphorus: 300 }, name: "Pilgrimsmusslor (uppskattat)", proteinSource: "fisk", gramsPerSt: 25, gramsPerForp: 300 });
add("blåmusslor|musslor|mussla|hjärtmusslor|vongole|clams|mussels", null, F, { override: { protein: 12, salt: 1, kcal: 80, potassium: 320, phosphorus: 200 }, name: "Blåmusslor, utan skal (uppskattat)", proteinSource: "fisk", gramsPerForp: 250, gramsPerSt: 8, gramsPerDl: 60 });
add("ostron", 1386, F, { proteinSource: "fisk", gramsPerSt: 15 });
add("skaldjur|skaldjursmix|fruits de mer|havets frukter", 1395, F, { proteinSource: "fisk", gramsPerForp: 400, gramsPerDl: 60 });

// ---------------------------------------------------------------------------
// Färska örter
// ---------------------------------------------------------------------------
add("basilika", 379, G, { ...HERB_UNITS });
add("dill|dillkvistar|dillvippor|krondill", 377, G, { ...HERB_UNITS });
add("persilja|bladpersilja|slätbladig", 352, G, { ...HERB_UNITS });
add("koriander|korianderblad|cilantro", 7193, G, { ...HERB_UNITS });
add("gräslök|salladslök|schalottenlök|charlottenlök|schalotten|vårlök", 344, G, { gramsPerSt: 25, gramsPerKnippe: 100, gramsPerDl: 40, gramsPerMsk: 6, gramsPerTsk: 2, gramsPerKruka: 15 });
add("mynta|\\bmint\\b|pepparmynta|citronmeliss|citrongräs|lemongrass|körvel|libbsticka|thaibasilika|kryddgrönt|örter\\b|färska örter|blandade örter|micro ?greens|krasse|ärtskott|skott\\b", null, G, { override: HERB, name: "Färska örter (uppskattat)", ...HERB_UNITS, gramsPerStjalk: 15 });
add("pepparrot", 291, KR, { gramsPerMsk: 15, gramsPerTsk: 5, gramsPerBit: 20, gramsPerSt: 100 });
add("ingefära|färsk ingefära|ingefärsrot", 2269, G, { gramsPerBit: 20, gramsPerSt: 30, gramsPerMsk: 8, gramsPerTsk: 3, gramsPerDl: 50, gramsPerKrm: 0.6 });

// ---------------------------------------------------------------------------
// Grönsaker och rotfrukter
// ---------------------------------------------------------------------------
add("sötpotatis", 3765, G, { gramsPerSt: 250, gramsPerDl: 65 });
add("pommes frites|pommes|klyftpotatis|potatisklyftor frysta", 238, FR, { gramsPerForp: 600, gramsPerDl: 45 });
add("potatismos|potatispuré|\\bmos\\b", 278, S, { gramsPerDl: 100, gramsPerForp: 400 });
add("mandelpotatis|delikatesspotatis|färskpotatis|potatis|potatisar|potatisen|potatoes|bakpotatis", 230, G, { gramsPerSt: 110, gramsPerDl: 65, gramsPerForp: 1000 });
add("rödlök|röd lök|rödlökar", 4947, G, { gramsPerSt: 90, gramsPerDl: 60, gramsPerMsk: 8 });
add("vitlök|vitlöksklyfta|vitlöksklyftor|garlic|solovitlök|svart vitlök", 371, G, { gramsPerSt: 4, gramsPerKlyfta: 4, gramsPerTsk: 5, gramsPerMsk: 10, gramsPerDl: 60 });
add("purjolök|purjo", 354, G, { gramsPerSt: 200, gramsPerDl: 50, gramsPerStjalk: 200 });
add("syltlök|steklök|pärllök|silverlök", 344, G, { gramsPerSt: 8, gramsPerDl: 60, gramsPerForp: 250 });
add("gul lök|\\blök\\b|lökar|lökarna|löken|onion|stekt lök|rostad lök", 344, G, { gramsPerSt: 100, gramsPerDl: 60, gramsPerMsk: 8, gramsPerForp: 1000 });
add("morot|morötter|moroten|morötterna|carrot", 289, G, { gramsPerSt: 80, gramsPerDl: 60, gramsPerForp: 1000 });
add("palsternacka|palsternackor", 290, G, { gramsPerSt: 100, gramsPerDl: 60 });
add("rotselleri|sellerirot", 292, G, { gramsPerSt: 600, gramsPerDl: 60, gramsPerBit: 200 });
add("stjälkselleri|bladselleri|selleristjälk|\\bselleri\\b|sellerin|celery", 321, G, { gramsPerSt: 40, gramsPerStjalk: 40, gramsPerDl: 50 });
add("kålrot", 288, G, { gramsPerSt: 700, gramsPerDl: 60 });
add("rödbeta|rödbetor|rödbetorna|beetroot|betor\\b|gulbetor|polkabetor", 294, G, { gramsPerSt: 100, gramsPerDl: 65, gramsPerForp: 500 });
add("jordärtskocka|jordärtskockor", 287, G, { gramsPerSt: 50, gramsPerDl: 60 });
add("fänkål", 336, G, { gramsPerSt: 250, gramsPerDl: 50 });
add("sparris|grön sparris|sparrisknippe", null, G, { override: { protein: 2.2, salt: 0, kcal: 22, potassium: 220, phosphorus: 55 }, name: "Sparris grön (uppskattat)", gramsPerSt: 20, gramsPerKnippe: 250, gramsPerForp: 250, gramsPerDl: 50 });
add("pumpa(?!frö|kärn)|butternut|hokkaido", 353, G, { gramsPerSt: 1000, gramsPerDl: 65, gramsPerBit: 300 });
add("zucchini|squash|courgette|zuccini", 362, G, { gramsPerSt: 250, gramsPerDl: 60 });
add("paprika|spetspaprika|romano|pimientos|padron", 351, G, { gramsPerSt: 150, gramsPerDl: 60, gramsPerForp: 400 });
add("chili|chilifrukt|jalapeño|jalapeno|habanero|röd chili|grön chili|chilipeppar|chilis|chilin", 380, G, { gramsPerSt: 15, gramsPerMsk: 8, gramsPerTsk: 3, gramsPerDl: 50 });
add("broccoli|broccolini|broccolibuketter", 325, G, { gramsPerSt: 350, gramsPerDl: 40, gramsPerForp: 500 });
add("blomkål|romanesco|blomkålsbuketter", 322, G, { gramsPerSt: 700, gramsPerDl: 40, gramsPerForp: 600 });
add("brysselkål", 327, G, { gramsPerDl: 60, gramsPerForp: 500, gramsPerSt: 10 });
add("grönkål|kale|svartkål|cavolo nero", 337, G, { gramsPerForp: 200, gramsPerDl: 20, gramsPerSt: 250, gramsPerKnippe: 250, gramsPerBlad: 15 });
add("rödkål", 355, G, { gramsPerSt: 1000, gramsPerDl: 45 });
add("savoykål|spetskål|vitkål|kålhuvud|surkål|coleslaw", 370, G, { gramsPerSt: 1000, gramsPerDl: 40 });
add("pak choi|paksoi|bok choy|pak choy", 358, G, { gramsPerSt: 200, gramsPerDl: 40 });
add("salladskål|kinakål|\\bkål\\b|kålen|kålblad", 358, G, { gramsPerSt: 700, gramsPerDl: 40, gramsPerBlad: 30 });
add("fryst spenat|frusen spenat|hackad spenat|spenat fryst|spenat, fryst|bladspenat fryst", 361, FR, { gramsPerForp: 250, gramsPerDl: 90, gramsPerSt: 30 });
add("babyspenat|spenat|bladspenat|spinach", 4941, G, { gramsPerForp: 65, gramsPerDl: 8, gramsPerNave: 25, gramsPerSt: 65 });
add("mâchesallad|machesallad|mâche|mache|ruccola|rucola|ruccolasallad|isbergssallad|romansallad|hjärtsallad|blandsallad|salladsblad|\\bsallad\\b|salladen|grönsallad|babyleaf|salladsmix|krispsallad|huvudsallad|endive|frisée|radicchio|vattenkrasse|mangold|salladshuvud|lollo|\\bgem\\b|little gem|ekbladssallad|\\bsallat\\b|grönsallat|bladgrönt|bladmix|mesclun", null, G, { override: { protein: 1.4, salt: 0, kcal: 15, potassium: 250, phosphorus: 30 }, name: "Grönsallad/bladgrönt (uppskattat)", gramsPerSt: 250, gramsPerForp: 65, gramsPerDl: 10, gramsPerNave: 20, gramsPerBlad: 8 });
add("gurka|slanggurka|cucumber", 339, G, { gramsPerSt: 400, gramsPerDl: 60, gramsPerBit: 100 });
add("rädisa|rädisor", 293, G, { gramsPerSt: 10, gramsPerKnippe: 120, gramsPerDl: 60 });
add("avokado|avocado", 320, G, { gramsPerSt: 140, gramsPerDl: 60 });
add("champinjon|champinjoner|portabello|portobello|skogschampinjon|\\bsvamp\\b|svampen|skivad svamp|blandsvamp|skogssvamp|kantarell|kantareller|trattkantarell|shiitake|ostronskivling|shimeji|kremla|karljohan|mushroom|enoki|kungsmussling|blandade svampar", 333, G, { gramsPerSt: 20, gramsPerDl: 35, gramsPerForp: 250 });
add("böngroddar|groddar|sojabönsgroddar", null, G, { override: { protein: 3, salt: 0, kcal: 30, potassium: 150, phosphorus: 50 }, name: "Böngroddar (uppskattat)", gramsPerDl: 30, gramsPerForp: 200 });
add("rotfrukter|rotfruktsmix|blandade rotfrukter|rotsaker", 286, G, { gramsPerForp: 500, gramsPerDl: 60 });
add("wokgrönsaker|wokmix|frysta grönsaker|grönsaksblandning|blandade grönsaker|grönsaksmix|grönsaker\\b|grönsaker$|grönsaker,|^grönsaker|grillgrönsaker|primörer", 389, FR, { gramsPerForp: 500, gramsPerDl: 60 });
add("kronärtskocka|kronärtskockshjärtan|kronärtskockor|artichoke", 342, G, { gramsPerSt: 50, gramsPerForp: 400, gramsPerDl: 60 });
add("bambuskott|vattenkastanjer|lotusrot", null, G, { override: { protein: 1.5, salt: 0.1, kcal: 30 }, name: "Bambuskott (uppskattat)", gramsPerForp: 200, gramsPerDl: 60 });
add("kokosflingor|riven kokos|\\bkokos\\b|kokosnöt|kokoschips", 1564, S, { gramsPerDl: 40, gramsPerMsk: 6 });

// Frukt
add("citronsaft|citronjuice|pressad citron|saft från|saften från|saft av|saften av|juice från|juicen från", 645, G, { ...LIQ, gramsPerSt: 40 });
add("limejuice|limesaft|pressad lime", 652, G, { ...LIQ, gramsPerSt: 25 });
add("apelsinjuice|apelsinsaft|\\bjuice\\b|juicen|äppeljuice|äpplejuice", 641, G, { ...LIQ });
add("citronskal|citronzest|zest\\b|rivet skal|skalet från|skal från", 602, G, { gramsPerMsk: 6, gramsPerTsk: 2, gramsPerSt: 6 });
add("citron|lemon", 559, G, { gramsPerSt: 100, gramsPerSkiva: 8, gramsPerKlyfta: 15, gramsPerBit: 15 });
add("lime|limefrukt", 572, G, { gramsPerSt: 65, gramsPerSkiva: 5, gramsPerKlyfta: 10 });
add("apelsin|blodapelsin|clementin|mandarin|satsumas", 551, G, { gramsPerSt: 180, gramsPerKlyfta: 15 });
add("(?<!granat)äpple|äpplen|äpplet|\\bapple\\b", 588, G, { gramsPerSt: 150, gramsPerDl: 60 });
add("banan|bananer", 553, G, { gramsPerSt: 120 });
add("päron", 583, G, { gramsPerSt: 160 });
add("mango|mangotärningar|fryst mango", 574, G, { gramsPerSt: 300, gramsPerForp: 400, gramsPerDl: 65 });
add("ananas", 550, G, { gramsPerSt: 900, gramsPerForp: 400, gramsPerDl: 65, gramsPerSkiva: 60, altPackaged: { foodId: 614, gramsPerForp: 400, drainedFactor: 0.6 } });
add("granatäpple|granatäppelkärnor", 520, G, { gramsPerSt: 100, gramsPerDl: 65, gramsPerMsk: 10 });
add("russin", 610, S, { gramsPerDl: 65, gramsPerMsk: 10 });
add("torkade aprikoser|aprikos|aprikoser", 599, S, { gramsPerSt: 8, gramsPerDl: 65 });
add("dadlar|dadel", 603, S, { gramsPerSt: 8, gramsPerDl: 65 });
add("fikon", 561, G, { gramsPerSt: 50, gramsPerDl: 65 });
add("lingonsylt|rårörda lingon|lingon|rårörda", 1798, S, { gramsPerMsk: 20, gramsPerDl: 130, gramsPerForp: 400 });
add("äppelmos", 1809, S, { gramsPerMsk: 17, gramsPerDl: 110, gramsPerForp: 400 });
add("blåbär|hallon|jordgubb|körsbär|vindruv|melon|kiwi|persika|nektarin|plommon|\\bbär\\b|björnbär|tranbär|physalis|passionsfrukt|papaya", null, G, { override: { protein: 0.8, salt: 0, kcal: 50, potassium: 150, phosphorus: 20 }, name: "Frukt/bär (uppskattat)", gramsPerDl: 60, gramsPerSt: 20, gramsPerForp: 250 });

// ---------------------------------------------------------------------------
// Nötter och frön
// ---------------------------------------------------------------------------
add("cashewnötter|cashew", 1557, S, { proteinSource: "vegetariskt", gramsPerDl: 65, gramsPerMsk: 10, gramsPerForp: 200, gramsPerNave: 30 });
add("jordnötter|jordnöt|peanuts", 1560, S, { proteinSource: "vegetariskt", gramsPerDl: 65, gramsPerMsk: 10, gramsPerForp: 200, gramsPerNave: 30 });
add("valnötter|valnöt|walnut", 1576, S, { gramsPerDl: 50, gramsPerMsk: 8, gramsPerForp: 200, gramsPerNave: 25 });
add("hasselnötter|hasselnöt|hazelnut", 1558, S, { gramsPerDl: 65, gramsPerMsk: 10, gramsPerForp: 200 });
add("pinjenötter|pinjenöt|pine nuts", null, S, { override: { protein: 14, salt: 0, kcal: 690, potassium: 600, phosphorus: 570 }, name: "Pinjenötter (uppskattat)", gramsPerDl: 65, gramsPerMsk: 10, gramsPerForp: 100 });
add("pistage|pistasch|pistagenötter", 1570, S, { gramsPerDl: 60, gramsPerMsk: 9, gramsPerForp: 200 });
add("mandelspån|mandlar|\\bmandel\\b|mandeln|sötmandel|mandelflarn|almond", 1575, S, { gramsPerDl: 60, gramsPerMsk: 9, gramsPerSt: 1.2, gramsPerForp: 200 });
add("nötter|nötmix|blandade nötter|nötblandning|paranötter|pekannötter|macadamia|\\bnuts\\b", 1558, S, { gramsPerDl: 60, gramsPerMsk: 9, gramsPerForp: 200, gramsPerNave: 30 });
add("sesamfrön|sesamfrö|\\bsesam\\b", 1572, S, { gramsPerMsk: 9, gramsPerTsk: 3, gramsPerDl: 65 });
add("solrosfrön|solrosfrö|solroskärnor", 1574, S, { gramsPerDl: 60, gramsPerMsk: 10 });
add("pumpafrön|pumpakärnor|pumpafrö", 1571, S, { gramsPerDl: 65, gramsPerMsk: 10 });
add("chiafrön|linfrön|\\bfrön\\b|fröblandning|hampafrön|psyllium|fröer|\\bkärnor\\b", null, S, { override: { protein: 20, salt: 0, kcal: 500, potassium: 600, phosphorus: 600 }, name: "Frön (uppskattat)", gramsPerDl: 65, gramsPerMsk: 10, gramsPerTsk: 3.5 });

// ---------------------------------------------------------------------------
// Bröd
// ---------------------------------------------------------------------------
add("tortillabröd|tortilla(?!chips)|vetetortilla|majstortilla|wraps?\\b|tacobröd|tunnbröd|mjuka tacos|mjuk taco|softtaco|soft ?tacos|burritobröd|piadina", 5974, B, { gramsPerSt: 40, gramsPerForp: 320, gramsPerSkiva: 40 });
add("tacoskal|tacos\\b|hårda tacos|tacoskalen", 2557, B, { gramsPerSt: 12, gramsPerForp: 150 });
add("tortillachips|nachochips|nachos|majschips|chips\\b", 1581, S, { gramsPerDl: 30, gramsPerForp: 200, gramsPerNave: 25 });
add("pitabröd|pita\\b|libabröd|naan|naanbröd|chapati|roti\\b|flatbread|fladenbröd|libanesiskt bröd", 193, B, { gramsPerSt: 60, gramsPerForp: 360 });
add("knäckebröd|knäcke", null, B, { override: { protein: 10, salt: 1.2, kcal: 340, potassium: 400, phosphorus: 300 }, name: "Knäckebröd (uppskattat)", gramsPerSt: 12, gramsPerForp: 250 });
add("krutonger|brödkrutonger", 3247, B, { gramsPerDl: 30, gramsPerForp: 100 });
add("surdegsbröd|levain|baguette|ciabatta|focaccia|\\bbröd\\b|brödet|brödskivor|vitt bröd|ljust bröd|formbröd|toastbröd|rostbröd|hamburgerbröd|brioche|korvbröd|hotdogbröd|lantbröd|frukostbröd|småfranska|frallor|fralla|bread|dinkelbröd|rågbröd|gammalt bröd|dagsgammalt bröd", 200, B, { gramsPerSkiva: 30, gramsPerSt: 60, gramsPerForp: 500, gramsPerBit: 40, gramsPerDl: 25 });

// ---------------------------------------------------------------------------
// Alkohol och övrigt
// ---------------------------------------------------------------------------
add("vitt vin|vitvin|torrt vitt vin|matvin vitt|vitt matvin|white wine", 1908, O, { ...LIQ });
add("rött vin|rödvin|rött matvin|red wine", 1907, O, { ...LIQ });
add("sherry|madeira|portvin|marsala|vermouth|vermut|torr sherry", 1916, O, { ...LIQ });
add("cognac|konjak|whisky|calvados|mörk rom|ljus rom|brandy|\\bsake\\b|risvin|mirin|shaoxing|vodka|\\bgin\\b|tequila|pastis|pernod|ouzo|grappa|armagnac", null, O, { override: { protein: 0, salt: 0, kcal: 230 }, name: "Sprit/matlagningsvin (uppskattat)", ...LIQ });
add("\\bvin\\b|vinet|mousserande|champagne|prosecco|cava", 1908, O, { ...LIQ });
add("\\böl\\b|ljus lager|mörk öl|stout|\\bporter\\b|\\blager\\b|\\bale\\b|veteöl|ölen", 1906, O, { ...LIQ });
add("cider", 1903, O, { ...LIQ });
add("gelatin|gelatinblad|agar", null, S, { override: { protein: 85, salt: 0.5, kcal: 340 }, name: "Gelatin (uppskattat)", gramsPerSt: 1.7, gramsPerTsk: 3 });

// ---------------------------------------------------------------------------
// Salt (sist av de generiska: allt som innehåller "salt" men inte ÄR salt ligger ovan)
// ---------------------------------------------------------------------------
add("flingsalt|havssalt|grovsalt|\\bsalt\\b|saltet|saltflingor|jodsalt|bordssalt|sea salt|maldon|fleur de sel|himalayasalt|bergsalt|gourmetsalt", 1975, KR, { isSalt: true, gramsPerTsk: 6, gramsPerMsk: 18, gramsPerKrm: 1.2, gramsPerNypa: 0.5, gramsPerDl: 120 });
// Reserv sist i kartan: rader med "vatten" som ingen råvara ovan matchade.
add("\\bvatten\\b|vattnet|isbitar|\\bis\\b", null, O, { isWater: true, ...LIQ, name: "Vatten" });

export const INGREDIENT_MAP = ENTRIES.map((e) => ({
  ...e,
  isMeat: e.isMeat ?? ["fisk", "fagel", "kott"].includes(e.proteinSource ?? ""),
}));

/** Alla livsmedelsnummer som kartan pekar på (inkl. alternativ). */
export function referencedFoodIds() {
  const ids = new Set();
  for (const e of INGREDIENT_MAP) {
    if (e.foodId) ids.add(e.foodId);
    if (e.altPackaged?.foodId) ids.add(e.altPackaged.foodId);
    if (e.altCount?.foodId) ids.add(e.altCount.foodId);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Hittar första matchande post för ett rensat ingrediensnamn. Returnerar posten eller null.
 * `raw` (hela raden) används för modifierare som "fryst", "på burk", "kokta".
 */
export function matchIngredient(name) {
  const n = String(name ?? "").toLowerCase().trim();
  if (!n) return null;
  for (const e of INGREDIENT_MAP) {
    if (e.pattern.test(n)) return e;
  }
  return null;
}

export function describePattern(e) {
  return e.pattern.source.length > 40 ? e.pattern.source.slice(0, 37) + "..." : e.pattern.source;
}
