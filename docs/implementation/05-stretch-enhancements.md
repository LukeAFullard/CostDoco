# Phase 5 — Stretch Enhancements

**Goal:** a menu of independent, opportunistic improvements — not a committed sequential build. Pick items up individually once Phases 0–4 are stable; none block each other.

**Depends on:** Phase 2 (crop/OCR pipeline) for items 1 and 3; Phase 1 for item 2; Phase 3 for item 4.

**Note:** the original item 4 (multi-currency handling) is resolved — see `06-open-questions-resolved.md` §4 — and has been replaced below with named export templates (from §7 of the same doc).

## Candidates

### 1. Auto-crop / perspective correction
- Replace Phase 1's manual 4-corner crop with automatic edge detection + perspective warp.
- Needs a computer-vision library (e.g. OpenCV.js) — a meaningful bundle-size cost for a PWA that's stayed dependency-light so far. Prototype behind a feature flag and measure the bundle-size delta before committing to ship it.
- Manual crop must remain available regardless — never make this a hard dependency.

### 2. Vendor memory / code auto-suggest
- Cut from v1 scope deliberately (see `PROJECT_PLAN.md` §6).
- If revisited: on save, record a simple (vendor text → codeId) frequency table; on new receipt entry, if OCR'd or typed vendor text closely matches a previous entry, suggest that receipt's code as a one-tap default. Suggestion only — never auto-apply without confirmation.

### 3. OCR-assisted line-item detection
- Phase 2 only used OCR to pre-fill header-level totals; itemized mode is fully manual.
- If revisited: attempt to segment OCR'd lines into individual line items (description + amount pairs) when the user switches a receipt to itemized mode, pre-filling the "add line" flow instead of starting blank.
- Higher OCR-accuracy bar than header-total matching (needs reliable line segmentation, not just one number) — validate against the Phase 0 spike's messier sample receipts before committing; likely not worth building if line-level accuracy is materially worse than header-total accuracy.

### 4. Named export templates
- Phase 3 ships one generic CSV column layout (confirmed sufficient for v1 — `06-open-questions-resolved.md` §7).
- If revisited: add selectable export templates matching specific accounting tools' import formats (e.g. Xero, QuickBooks), each just a different column mapping/header set over the same underlying data — no schema change required, purely a CSV-formatting layer.

## Definition of Done
- Each candidate is either shipped behind a settings toggle, explicitly rejected with a one-line reason recorded here, or left open for a later cycle. None are required for CostDoco to be considered feature-complete.
