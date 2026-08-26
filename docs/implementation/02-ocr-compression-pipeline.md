# Phase 2 — OCR & Compression Pipeline

**Goal:** layer OCR-assisted entry and trustworthy compression on top of Phase 1's manual flow, without making either mandatory.

**Depends on:** Phase 1. Uses the pinned `liteparse-wasm` version and spike findings from Phase 0.

## Steps

1. **Initialise the pipeline**
   - Lazy-load `liteparse-wasm` + `tesseract.js` on first OCR use (not on app start), to keep initial load fast — per the Phase 0 bundle-size findings.

2. **Route by input type**
   - Captured/cropped photos → liteparse's pure-Rust image→PDF conversion (per page), then merge multi-page sets into one PDF.
   - Uploaded PDFs → run liteparse's `isComplex` / `needsOcr` check first.
     - Has a real text layer → skip OCR and recompression entirely; extract text directly.
     - Image-based/scanned → treat like a captured photo (rasterize, OCR, recompress).

3. **Run OCR**
   - liteparse's selective OCR (only on pages that need it) via the `tesseract.js`-backed `ocrEngine.recognize` callback from Phase 0.
   - Collect text + bounding boxes per page.

4. **Field-matching heuristic (best-effort only)**
   - Search OCR'd text for currency-formatted numbers near keywords ("total", "gst", "tax", "vat" — locale-configurable list).
   - Pre-fill `amountExTax` / `amountIncTax` / `vendorTaxNumber` when a confident match is found. Never block saving if nothing matches.

5. **Correction UI**
   - Render OCR'd lines beside the image at matching vertical positions, each editable inline.
   - Clicking a manual field highlights its matched OCR box, if any — a visual link between form field and source text.

6. **Compression preview**
   - Render the candidate compressed PDF at true pixel size, zoomable.
   - Auto-zoom to the bounding boxes of the total and tax-number fields specifically as the default preview view.
   - Offer 2–3 presets (e.g. High quality / Recommended / Smallest) with a live estimated file size each; default = Recommended.

7. **Finalise & discard**
   - On confirm: write the compressed PDF as the real `pdfBlobRef` (replacing Phase 1's placeholder), persist the OCR bounding boxes alongside it for future reference, and permanently discard the original uncompressed bytes.

8. **Duplicate detection**
   - Before saving, compare (vendor text, total, date) fuzzy match and/or a hash of the final PDF against existing receipts.
   - Non-blocking warning if a likely duplicate is found — never prevent saving.

## Definition of Done
- Photo or file in → OCR pre-filled where possible, fully correctable, compressed with a verifiable preview, original discarded, duplicates flagged.
- A receipt saved with OCR fully skipped (e.g. offline, or on failure) still works via Phase 1's manual path unchanged.
