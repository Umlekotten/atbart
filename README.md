# Ätbart

Ätbart hjälper dig att hitta matval som fungerar för dig, så att du kan lägga mindre tid på att fundera och mer tid på att leva.

Kostapp för personer med njursvikt (stadium 3–5, ej dialys), med fokus på protein och salt.
Hackathon på Hogia, september 2026. Arbetstiteln under pitchen var "Vad F*N får jag äta då?". Namn och tagline ligger i `app/src/appName.ts`.

Planen och bakgrunden finns här: https://claude.ai/code/artifact/ea9c7fda-3c81-40fa-958c-4a576fa38bd9

## Mappar

| Mapp | Innehåll |
|---|---|
| `data/` | Gemensamt schema (`recipe-schema.ts`) och genererad receptbank (`recipes.json`) |
| `scraper/` | Node-skript som hämtar recept från köket.se, räknar näring via Livsmedelsverket och klassar recepten |
| `app/` | Demoappen (Vite + React + TypeScript), mobil-först webbapp utan backend |

## Snabbstart

```bash
# Receptbank (tar några minuter, cachar allt lokalt)
cd scraper && npm install && npm run pipeline

# App
cd app && npm install && npm run dev
```

Appen läser `app/src/data/recipes.json`. Skrapan skriver dit när den är klar (steget `npm run build` i `scraper/` räcker om cachen finns).

Teamets egna recept ligger i `data/egna-recept.json` och läggs till i receptbanken vid varje bygge. Följ schemat i `data/recipe-schema.ts`.

Varje recept har både originalvärden (`nutrition`) och den njurvänliga versionen (`adaptedNutrition`, plus `adapted` per ingrediens med faktor och notis). Appen visar den njurvänliga versionen som standard.

Felsök ett enskilt recept:

```bash
cd scraper && node debug.mjs torsk-med-brynt-kapris-och-citronsmor
```

## Deploy till Vercel

Repot är förberett för Vercel med `vercel.json` i roten: installation och bygge sker i `app/`, och `app/dist` publiceras.

1. Importera GitHub-repot i Vercel.
2. Lämna **Root Directory** tom (repots rot). Då används `vercel.json` och appen kan läsa `data/recipe-schema.ts` som ligger utanför `app/`.
3. Inga miljövariabler behövs. Appen är helt statisk och sparar allt i webbläsaren.

Sätter ni i stället Root Directory till `app` måste "Include source files outside of the Root Directory" vara påslaget i projektinställningarna, annars saknas schemat vid bygget.

Receptbanken (`app/src/data/recipes.json`) är incheckad, så Vercel behöver inte köra skrapan.

## Datakällor

- Recept: köket.se (schema.org Recipe i sidornas JSON-LD). Endast för intern demo, kontrollera villkor före publik användning.
- Näringsvärden: Livsmedelsverkets livsmedelsdatabas, `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel`.

## Viktigt om innehållet

Siffrorna är ungefärliga och tröskelvärdena är hackathon-antaganden. Recept och riktvärden ska granskas av dietist innan riktiga användare får appen. Dialys och transplantation har andra mål och stöds inte.
