# Phase 0 — Foundation

**Goal:** scaffold the repo, bring in shared suite design tokens, stand up the storage/PWA skeleton, and validate the OCR pipeline is viable before building on top of it.

**Depends on:** none — this is the starting point.

## Steps

1. **Scaffold the project**
   - Vite + React 19 + TypeScript, mirroring TimeDoco/NoteDoco's config files (`tsconfig*.json`, `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`, `.oxlintrc.json`).
   - Copy these config files from the NoteDoco repo as a starting point rather than writing from scratch — they're already tuned for this stack.

2. **Bring in shared design tokens**
   - Add the six-colour token set (`ink`, `stone`, `graphite`, `signal`, `verdigris`, `rust`) to `tailwind.config.js` — values in `PROJECT_PLAN.md` §2.2.
   - Add IBM Plex Sans / IBM Plex Mono via the same font-loading approach TimeDoco uses.
   - Default theme: light. Confirm the light/dark toggle mechanism from TimeDoco/NoteDoco still works with these tokens.

3. **Port shared UI primitives**
   - Copy `Panel`, `Button` (`primary`/`secondary`/`danger`/`ghost`), `Modal`, `Input` components from NoteDoco or TimeDoco as-is.
   - Note as tech debt: this is a copy, not a shared package. A true shared component package is a suite-wide refactor, out of scope here.

4. **Define the IndexedDB schema (v1, empty)**
   - Via `idb`, create object stores: `groups`, `codes`, `receipts`, `settings`.
   - Store names and primary keys only — full field-level schema comes in Phase 1.

5. **PWA shell**
   - `manifest.json`, service worker registration, offline app-shell caching — mirror the existing TimeDoco/NoteDoco setup.
   - Confirm it installs and loads offline as an empty shell before moving on.

6. **OCR/PDF pipeline spike (throwaway code, not shipped)**
   - Install `@llamaindex/liteparse-wasm`. Run `npm view @llamaindex/liteparse-wasm versions` and pin the latest stable release ≥ `wasm-v2.8.1`, confirming via that release's notes that it includes the pure-Rust image→PDF conversion.
   - Install `tesseract.js`. Wire it as the `ocrEngine.recognize` callback liteparse-wasm expects.
   - Build a standalone test harness (a script or throwaway route — not part of the shipped app) that:
     - Runs image→PDF conversion on 15–20 real sample receipt photos (mix of clean and messy: thermal fade, skew, crumpled).
     - Runs OCR on each and records: was the total correctly identified, was any tax/GST number correctly identified, processing time, and the resulting bundle-size impact of `liteparse-wasm` + `tesseract.js` together.
   - Write findings to `docs/ocr-spike-results.md` (accuracy %, time, size). This does not gate the rest of the roadmap — manual entry is always available regardless of outcome — but should inform how prominently OCR is surfaced in the UI.

## Definition of Done
- App builds, lints, and passes a trivial test suite.
- Empty-shell PWA installs and loads offline.
- `docs/ocr-spike-results.md` exists with real numbers, and a pinned `liteparse-wasm` version is recorded in `package.json`.
