# OCR/PDF Pipeline — Status

`docs/implementation/00-foundation.md` (step 6) called for a throwaway spike that runs
`@llamaindex/liteparse-wasm` + `tesseract.js` against 15–20 real sample receipt photos and
records accuracy/time/bundle-size findings here before Phase 2 begins.

That never happened — no real receipt photos were available in this environment, and the
plan is explicit that findings must be **real numbers**, not estimates. Rather than block
on that indefinitely, Phase 2 (OCR & Compression Pipeline) was implemented directly against
the real npm packages, and this file now records what building it actually surfaced.

## Real finding: `liteparse-wasm` is a PDF parser, not an image→PDF encoder

The plan's Phase 0/2 text describes "liteparse's pure-Rust image→PDF conversion." The
released package (`@llamaindex/liteparse-wasm@2.14.0`) does not have that API — it parses
existing PDF bytes (extracting a spatial text layer, optionally via a JS-supplied OCR
engine for pages that need it) and offers no way to encode a raw photo into a PDF.

The pipeline (`src/ocr/pipeline.ts`, `src/utils/pdf.ts`) was built around what the package
actually does instead of what the plan assumed: `jsPDF` (already a planned dependency, per
`PROJECT_PLAN.md` §5) builds a one-image-per-page PDF from captured/cropped photos, and
`liteparse-wasm` is then used for its real job — `isComplex()` to decide which pages need
OCR, and `parse()` (with `tesseract.js` wired in as the `ocrEngine.recognize` callback) to
extract the text layer, running OCR only on the pages that need it. An uploaded PDF that
already has a real text layer skips OCR the same way, automatically, via the same call.

## Real finding: bundle size

`liteparse-wasm`'s `.wasm` binary alone is **~5.47 MB** (measured from an actual production
build, `npm run build`), well over `vite-plugin-pwa`'s 2 MB default precache limit — the
build fails outright until it's excluded from precache. `vite.config.ts` now does that
(`workbox.globIgnores: ['**/*.wasm']`) and caches it at runtime instead (`CacheFirst`, keyed
off first actual use), which also happens to be the correct behavior for "lazy-load on
first OCR use, not on app start" (Phase 0 step 6's other requirement). Confirmed via the
build output that both `liteparse-wasm` and `tesseract.js` are dynamically imported into
their own chunks and never touch the main bundle — `src/ocr/pipeline.ts` and
`src/ocr/tesseractEngine.ts` only `import()` them inside the functions that actually run
OCR.

## Still unvalidated: real-world OCR accuracy

Whether the field-matching heuristic (`src/ocr/fieldMatch.ts`) and tesseract's recognition
actually work well against real receipts — thermal fade, skew, crumpled paper, low light —
has **not** been tested, for the same reason the original spike wasn't: no real receipt
photos in this environment. `fieldMatch.ts` is unit-tested against hand-built OCR output
(known text + keyword positions), which validates the matching *logic*, not tesseract's
actual recognition quality on messy input. `docs/implementation/02-ocr-compression-pipeline.md`'s
Definition of Done is otherwise met — OCR pre-fills the total when confident, never blocks
manual entry, and a receipt saved with OCR skipped (offline, pipeline failure, or the
explicit "Skip OCR" action) works via the unchanged Phase 1 manual path.

## What's still needed

1. A set of real sample receipt photos (mix of clean and messy conditions) to actually run
   the pipeline against and record accuracy/timing numbers here.
2. Self-hosting tesseract.js's core/worker/lang-data files under the app's own origin
   (`src/ocr/tesseractEngine.ts` currently uses tesseract.js's defaults, which fetch from a
   CDN) — required for the "100% offline PWA" non-negotiable once OCR has actually run
   once and needs to keep working offline afterward.
