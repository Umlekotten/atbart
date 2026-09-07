/**
 * Gemensamt dataschema för receptbanken.
 *
 * Skrapan (scraper/) producerar `data/recipes.json` som en `RecipeDatabase`.
 * Appen (app/) läser samma fil från `app/src/data/recipes.json`.
 *
 * Alla näringsvärden är PER PORTION och ungefärliga ("ca").
 */

/** Hur väl receptet passar en protein- och saltreducerad kost vid njursvikt stadium 3–5 (ej dialys). */
export type Fit =
  | "passar" // som det är skrivet ligger det under tröskelvärdena
  | "anpassa" // hamnar under tröskelvärdena efter de föreslagna anpassningarna
  | "passar-inte"; // för mycket protein eller salt även efter anpassning

/** Hur mycket jobb receptet är. Styr filtret "Enkel / Från grunden" i appen. */
export type Effort = "enkel" | "medel" | "fran-grunden";

export type MealType = "middag" | "lunch" | "frukost" | "efterratt" | "tillbehor" | "annat";

/** Butikskategori för inköpslistan. */
export type StoreCategory =
  | "gronsaker-frukt"
  | "kott-fagel"
  | "fisk-skaldjur"
  | "mejeri-agg"
  | "skafferi" // torrvaror, konserver, ris, pasta, mjöl
  | "kryddor-smaksattare" // salt, soja, buljong, kryddor, vinäger
  | "brod"
  | "frys"
  | "ovrigt";

export interface Nutrition {
  /** gram protein per portion */
  protein: number;
  /** gram salt (NaCl) per portion. Natrium × 2,5 om bara natrium finns. */
  salt: number;
  /** kcal per portion */
  energyKcal: number;
  /** mg kalium per portion (valfritt, för senare) */
  potassium?: number;
  /** mg fosfor per portion (valfritt, för senare) */
  phosphorus?: number;
  /**
   * Andel av receptets ingrediensvikt som kunde matchas mot ett livsmedel (0–1).
   * Under 0,7 betyder att siffrorna är osäkra och appen bör visa det.
   */
  coverage: number;
}

export interface Ingredient {
  /** Raden exakt som den stod i källan, t.ex. "600 g torskrygg (eller torskfilé)" */
  raw: string;
  /** Tolkad mängd, t.ex. 600. Saknas om raden är "salt" eller "färsk dill". Vid intervall (1–1,5 dl) används mitten. */
  quantity?: number;
  /** Tolkad enhet i normaliserad form: g, kg, dl, l, ml, cl, msk, tsk, krm, st, forp, burk, klyfta, knippe, nypa */
  unit?: string;
  /** Rensat ingrediensnamn, t.ex. "torskrygg" */
  name: string;
  /** Uppskattad vikt i gram för hela receptet (alla portioner). Saknas om det inte gick att uppskatta. */
  grams?: number;
  /** Livsmedelsverkets livsmedelsnummer (fältet `nummer` i API:t) om ingrediensen matchades. */
  foodId?: number;
  /** Livsmedelsverkets namn på det matchade livsmedlet. */
  foodName?: string;
  /** Butikskategori för inköpslistan. */
  category: StoreCategory;
  /** True om vi kunde räkna näring på raden. */
  matched: boolean;
  /**
   * Hur raden ändras i den njurvänliga versionen, som appen visar som standard.
   * Saknas om raden inte påverkas av någon anpassning.
   */
  adapted?: IngredientAdaptation;
}

export interface IngredientAdaptation {
  /** Faktor på mängden: 0 = tas bort, 0.5 = halveras, 1 = mängden är oförändrad (bara en notis). */
  factor: number;
  /** Kort notis efter ingrediensen, t.ex. "sköljda", "saltreducerad", "egen blandning utan salt". */
  note?: string;
  /** Vilka anpassningar som påverkar raden. */
  kinds: Adaptation["kind"][];
}

export interface IngredientGroup {
  /** Rubrik i receptet, t.ex. "Potatispuré". Saknas för den första, orubricerade gruppen. */
  title?: string;
  ingredients: Ingredient[];
}

/**
 * En konkret anpassning som gör receptet njurvänligare.
 * `kind` är maskinläsbar så appen kan visa ikoner och räkna om.
 */
export interface Adaptation {
  kind:
    | "skippa-salt" // ta bort tillsatt salt, krydda med citron/örter/peppar
    | "byt-buljong" // buljongtärning/fond → egen saltfri fond eller vatten + kryddor
    | "minska-kott" // minska mängden kött/fisk/fågel till ca 100 g per portion, öka grönsaker
    | "byt-ost" // salt ost (feta, parmesan, halloumi) → mindre mängd eller mildare ost
    | "skolj-konserv" // skölj bönor/kikärter/majs från burk
    | "byt-charkuteri" // bacon, korv, skinka → färsk kyckling eller bönor i liten mängd
    | "egen-kryddmix" // färdig kryddmix/taco-/tikka-krydda → egen blandning utan salt
    | "byt-soja" // soja/fisksås → mindre mängd, saltreducerad, eller lime + ingefära
    | "mer-gronsaker" // öka grönsaksmängden så portionen mättar utan mer protein
    | "annat";
  /** Text för användaren, i du-tilltal, t.ex. "Hoppa över saltet i potatisvattnet och smaka av med dill och citron i stället." */
  text: string;
  /** Uppskattad effekt per portion. Negativa tal = minskning. */
  effect?: { protein?: number; salt?: number };
}

export interface Recipe {
  /** Stabil id, slug från källans URL, t.ex. "torsk-med-brynt-kapris-och-citronsmor" */
  id: string;
  source: "koket.se" | "egen";
  sourceUrl: string;
  name: string;
  description: string;
  /** Bild-URL hos källan. Kan vara tom. */
  image: string;
  author?: string;
  totalMinutes?: number;
  /** Antal portioner receptet är skrivet för. Om det inte gick att tolka: 4. */
  portions: number;
  mealType: MealType;
  effort: Effort;
  /** Från källan, t.ex. ["Huvudrätt"] */
  category: string[];
  cuisine: string[];
  keywords: string[];
  /** Grov proteinkälla för variation i veckoplanen. */
  proteinSource: "fisk" | "fagel" | "kott" | "vegetariskt" | "agg-mejeri" | "blandat";
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  /** Som receptet är skrivet. */
  nutrition: Nutrition;
  /** Efter att alla `adaptations` tillämpats. Samma som `nutrition` om listan är tom. */
  adaptedNutrition: Nutrition;
  adaptations: Adaptation[];
  fit: Fit;
}

export interface RecipeDatabase {
  /** ISO-datum när filen genererades */
  generatedAt: string;
  /** Tröskelvärden som användes för `fit`. Per middagsportion. */
  thresholds: {
    proteinMax: number;
    saltMax: number;
  };
  recipes: Recipe[];
}

/**
 * Tröskelvärden per middagsportion. Ett dagsmål på ca 55 g protein och 5 g salt
 * fördelas ungefär: frukost 10 g / 1 g, lunch 18 g / 1,5 g, middag 20 g / 1,5 g, mellanmål resten.
 * Dessa är hackathon-antaganden och ska godkännas av dietist.
 */
export const DEFAULT_THRESHOLDS = {
  proteinMax: 20,
  saltMax: 1.5,
} as const;

/**
 * Antaganden vid tolkning av ingredienser utan mängd.
 * "salt" utan mängd räknas som ½ tsk (3 g) för hela receptet.
 * "peppar", "färsk dill" m.fl. utan mängd räknas som 0 g näring.
 */
export const UNQUANTIFIED_SALT_GRAMS = 3;
