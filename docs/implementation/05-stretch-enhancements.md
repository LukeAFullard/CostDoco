# Phase 5 — Stretch Enhancements

**Goal:** a menu of independent, opportunistic improvements — not a committed sequential build. Pick items up individually once Phases 0–4 are stable; none block each other.

**Depends on:** Phase 2 (crop/OCR pipeline) for items 1 and 3; Phase 1 for item 2; Phase 3 for item 4.

**Note:** the original item 4 (multi-currency handling) is resolved — see `06-open-questions-resolved.md` §4 — and has been replaced below with named export templates (from §7 of the same doc).

## Candidates

### 1. Auto-crop / perspective correction — left open
- Replace Phase 1's manual 4-corner crop with automatic edge detection + perspective warp.
- Needs a computer-vision library (e.g. OpenCV.js) — a meaningful bundle-size cost for a PWA that's stayed dependency-light so far. Prototype behind a feature flag and measure the bundle-size delta before committing to ship it.
- Manual crop must remain available regardless — never make this a hard dependency.
- **Status:** left open. Not attempted this cycle — no CV dependency has been added, so the bundle stays dependency-light (see the Phase 2 OCR pipeline's `wasm`/`tesseract.js` lazy-loading, which this would sit alongside). Revisit only if manual cropping proves to be a real pain point in practice.

### 2. Vendor memory / code auto-suggest — shipped
- Implemented in `src/utils/vendorMemory.ts` (`suggestCodeForVendor`): tallies, per past receipt, which cost code was used for a closely-matching vendor name (normalized exact match, or a substring match once both names are ≥3 characters), and returns the most frequently-used one.
- Wired into `src/pages/ReceiptForm.tsx`: while a receipt has no cost code yet and its vendor field is non-blank, a banner offers "Past receipts from `<vendor>` used cost code `<code>`" with a **Use this code** button. Suggestion only — the code is never applied without the explicit click, and the banner only ever suggests a code that's already valid for the receipt's current group.
- Covered by `src/utils/vendorMemory.test.ts` (matching/tally logic) and a `ReceiptForm.test.tsx` case exercising the full suggest → click → apply flow, plus a case confirming no suggestion is shown once a code is already set.

### 3. OCR-assisted line-item detection — left open
- Phase 2 only used OCR to pre-fill header-level totals; itemized mode is fully manual.
- If revisited: attempt to segment OCR'd lines into individual line items (description + amount pairs) when the user switches a receipt to itemized mode, pre-filling the "add line" flow instead of starting blank.
- Higher OCR-accuracy bar than header-total matching (needs reliable line segmentation, not just one number) — validate against the Phase 0 spike's messier sample receipts before committing; likely not worth building if line-level accuracy is materially worse than header-total accuracy.
- **Status:** left open. Not attempted this cycle — doing this credibly requires re-running the Phase 0 spike's messier sample receipts through line-segmentation first to see whether accuracy holds up; that validation hasn't happened yet, so building the UI ahead of it would risk shipping a feature that mis-splits lines more often than it helps.

### 4. Named export templates — shipped
- Phase 3 shipped one generic CSV column layout (confirmed sufficient for v1 — `06-open-questions-resolved.md` §7); this adds selectable named templates alongside it, each just a different column mapping over the same receipt data — no schema change.
- Implemented in `src/utils/csvTemplates.ts` as `CSV_TEMPLATES`: `generic` (the existing full export, unchanged), `xero-bills` (matches Xero's Bills CSV import columns — `*ContactName, *InvoiceNumber, *InvoiceDate, *DueDate, *Description, *Quantity, *UnitAmount, *AccountCode, TaxType, Currency`; account codes must already exist in the target Xero org's chart of accounts, and `TaxType` is left blank for the user to set a default at import time), and `quickbooks-banking` (QuickBooks Online's generic 3-column `Date, Description, Amount` banking import, with expense amounts exported negative).
- Wired into `src/pages/Reports.tsx` as a "CSV format" dropdown above the existing Export CSV / Generate PDF Report buttons, with the template's description shown inline and reflected in the downloaded filename.
- Covered by `src/utils/csvTemplates.test.ts` (column layout and value mapping per template) and a `Reports.test.tsx` case that switches templates and exports.

## Definition of Done
- Each candidate is either shipped behind a settings toggle, explicitly rejected with a one-line reason recorded here, or left open for a later cycle. None are required for CostDoco to be considered feature-complete.
- **Current status:** candidates 2 and 4 shipped (see above, both suggestion-only / additive, no settings toggle needed since neither changes existing behavior by default); candidates 1 and 3 left open with reasons recorded above.
