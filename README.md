# Ocupados

**¿En qué trabaja España?**

Bilingual, mobile-first exploration of employment in Spain: 35 curated industries, annual EPA averages for 2008–2025, a stable animated treemap, linked top-six growth rankings, increase/decrease Sankey diagrams and sector histories.

Published at **https://danielalmazan.com/ocupados/**. Spanish is the default; a shared URL restores the language, comparison, displayed year, sector and chart settings.

## Run locally

Node 24 LTS and Python 3.9+ are required (CI uses Python 3.12).

```sh
npm ci
npm run dev
```

Open the printed `/ocupados/` address. No credentials, database or runtime source APIs are required.

```sh
npm test
npm run build
npm run preview
```

The build independently regenerates and compares processed outputs against hashed source snapshots. It does **not** download new data. Tests cover every one of the 153 annual comparisons, denominators, rounding reconciliation, unavailable values, zero baselines, Sankey conservation and grouping, colour contrast, and URL validation.

## Sources and reproducibility

- INE EPA annual table **65985**, both sexes, absolute values, thousands of people: https://www.ine.es/jaxiT3/Tabla.htm?t=65985
- INE JSON: https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/65985?tip=AM
- Eurostat **lfsa_egan22d**, with section totals from **lfsa_egan2**, filtered to ES, T, Y_GE15, A, THS_PER, 2008–2025, for comparison and source-specific quality flags.
- EPA definitions: https://ine.es/dynt3/metadatos/es/RespuestaPrint.html?oper=293
- Census-base revision: https://www.ine.es/dyngs/Prensa/es/cbEPA2021.htm
- CNAE transition: https://www.ine.es/dyngs/Prensa/EPA1T26.htm

All displayed employment values and national denominators are **INE values**. Eurostat values are never substituted into the INE series. Employment is people aged 16 and over living in private households, by their main job’s establishment activity, including employees and self-employed people. Each annual observation is the average of four quarters, not Q4. Activity is not occupation, and administration is not all public employment.

`data/taxonomy.json` defines names, descriptions, exhaustive division assignments and exact extraction recipes. Published sections are used for A; B+D+E; F; K; L; O+U; R; S; T. Other groups use division sums. Section totals are never added to their own divisions. The unavailable division 98 remains unavailable in the raw source; its encompassing published section T is used, without imputing zero.

`data/raw/manifest.json` selects immutable, content-addressed snapshots and records SHA-256 hashes, retrieval dates and available source-update dates. `data/audit.json` contains cross-source comparisons, raw Eurostat flags, missing observations and reconciliation. `public/data/` holds the browser JSON and CSV download.

### Refreshing data

```sh
npm run data:refresh
npm test
npm run build
```

Review changes to snapshots, taxonomy, audit, warnings and processed values **before** committing. The manual “Prepare official-data candidate” workflow only uploads an artifact. It never commits or deploys. A new annual year/classification is rejected pending review; do not silently extend CNAE-2009 into CNAE-2025. Build and publication use only a reviewed committed release.

### Precision and comparability

- 2008–2020 uses population base 2011; 2021 onwards uses base 2021. The revised 2021–2023 observations are retained. Comparisons crossing 2021 visibly disclose the population-base and methodology changes.
- Eurostat’s `u`, `b`, and `d` flags remain attributed to Eurostat, not recast as calculated INE sampling errors. Component reliability warnings do not establish the variance of an aggregate.
- No confidence intervals or statistical significance claims are invented. Comparability and sampling notes remain available in the sector detail and methodology.
- Source precision is 100 people. The 69-term recipe permits a worst-case rounding discrepancy of ±3,500 against the separately rounded national total. Observed annual differences are at most 400 people.
- In 2018–2025, sector increases total 3,010,300 and decreases 116,500: a sector net of 2,893,800, versus national change 2,893,400. The −400 rounding difference is retained in the downloadable data and audit; no sectors are adjusted to force a sum. No residual employment category is manufactured.
- Shares use the published national total. Contribution percentages, where shown, use sums of positive or negative **sector changes**, never net national change and never gross flows of job creation/destruction.

## Frontend structure

`src/data.ts` contains pure calculations, insights and URL validation. `src/state.tsx` owns shared exploration state and playback. D3 owns dedicated SVG mark groups for the treemap and rankings; React owns controls, Sankey marks and layout. `src/sankey.ts` computes separate positive/negative flows and proportional, non-overlapping geometry. The historical chart uses D3 scales and paths with React-owned marks. `src/i18n.ts` contains matching ES/EN dictionaries and locale formatters. No client-side path router is needed.

URL settings: `lang`, `from`, `to`, `year`, `sector`, `metric=absolute|relative|share`, `sort=gain|loss|magnitude`, `view=leaders|all`, `detail=people|share`. Invalid parameters safely fall back. Playback keeps the comparison period fixed and moves only the displayed year and history cursor. Reduced motion uses explicit year stepping.

Self-hosted Archivo and Source Serif 4 fonts are provided by Fontsource under their included OFL licenses. The approved “Blanco y señal” palette and two alternatives are defined in `src/palettes.json`; sector colours are presentation overrides and never change the frozen statistical release. Each palette has 35 distinct colours with automatic AA-contrast tile text. Keyboard chart navigation uses arrow keys, Home/End and Enter/Space; a sector search and accessible data table provide alternatives to small marks.

On mobile the three ranking metrics form a horizontally scrollable strip. Selecting any sector opens its full modal directly, with current-year employment, share and rank. The fixed bar contains the brand, one comparison dropdown (2018, 2008 and 2020 presets plus custom years), and ES/EN. Section 04 is collapsed by default; direct methodology links reveal the referenced details.

## Deployment

Vite base is `/ocupados/`. The GitHub Pages workflow validates data, runs tests, builds and publishes `dist/`. Enable Pages with GitHub Actions in this project repository. Its project site inherits `danielalmazan.com` from the account’s user site; **do not add the root domain as this project’s CNAME**. No personal-site files need modification.

Keep earlier Git commits/releases for rollback. Do not publish source refreshes that have not been reviewed.

## Licensing and attribution

Project code: MIT. Source data and definitions retain their respective INE and Eurostat reuse terms. Cite INE as the primary source and Ocupados as the author of the curated aggregation; derived calculations and presentation are the author’s responsibility.
