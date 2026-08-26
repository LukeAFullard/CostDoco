# OCR/PDF Pipeline Spike — Status

`docs/implementation/00-foundation.md` (step 6) calls for a throwaway spike that runs
`@llamaindex/liteparse-wasm` (pinned `wasm-v2.14.0`) + `tesseract.js` against 15–20 real
sample receipt photos and records accuracy/time/bundle-size findings here.

## Status: not run — blocked on sample data

This implementation session had no real receipt photos (clean or messy — thermal fade,
skew, crumpled) available to run the spike against, and the plan is explicit that
findings must be **real numbers**, not estimates. Fabricating accuracy percentages here
would defeat the purpose of the spike, so it has been left undone rather than faked.

Per the plan, this does not block the rest of the roadmap: "manual entry is always
available regardless of outcome." Phase 0's other deliverables (scaffold, design tokens,
shared UI primitives, IndexedDB schema, PWA shell) and all of Phase 1 (capture, crop,
manual entry, groups/cost codes, receipt list) are implemented, tested, and do not depend
on OCR in any way.

## What's needed to complete this step

1. A set of 15–20 real sample receipt photos (mix of clean and messy conditions), supplied
   by whoever picks up Phase 2.
2. Add `@llamaindex/liteparse-wasm` (pinned `wasm-v2.14.0`, per
   `docs/implementation/06-open-questions-resolved.md` §2) and `tesseract.js` as
   dependencies, wired as a standalone throwaway test harness — not part of the shipped
   app.
3. Run image→PDF conversion and OCR on each sample; record per-photo: was the total
   correctly identified, was any tax/GST number correctly identified, processing time.
4. Record the combined bundle-size impact of `liteparse-wasm` + `tesseract.js`.
5. Replace this file's contents with the real findings before starting Phase 2 (OCR &
   Compression Pipeline) so the correction-UI and compression-preview work in
   `docs/implementation/02-ocr-compression-pipeline.md` is informed by real accuracy data.
