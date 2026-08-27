# CostDoco — Progress Report

_Last updated: 2026-08-26_

A snapshot of what's built, what's verified, and what's genuinely still open — as
distinct from what the phase docs describe as done. Where a phase's own
Definition of Done wasn't fully met in practice, that's called out explicitly
rather than glossed over.

## Status at a glance

| Phase | Topic | Status |
|---|---|---|
| 0 | Foundation | Done, with one caveat (no real-photo OCR spike — see Known Gaps) |
| 1 | Data model & manual entry MVP | Done |
| 2 | OCR & compression pipeline | Done, with one caveat (OCR accuracy unvalidated against real receipts) |
| 3 | Reporting, export & backup | Done |
| 4 | Security (encryption at rest) | Done |
| 5 | Stretch enhancements | Partially done by design — 2 of 4 candidates shipped, 2 left open |
| 6 | Open questions resolved | Done |
| 7 | Doco Suite Bridge | Not started — deliberately unscoped until Phases 0–6 are stable in production |

Full test suite: **200 tests passing** across 30 files (Vitest + Testing
Library). `tsc -b` and `oxlint` both clean (two pre-existing lint warnings in
`AppDataContext.tsx` remain, unrelated to functionality).

---

## What's implemented

### Phase 0 — Foundation
- Vite + React 19 + TypeScript scaffold, shared design tokens (`ink`,
  `stone`, `graphite`, `signal`, `verdigris`, `rust`), IBM Plex Sans/Mono.
- Shared UI primitives (`Panel`, `Button`, `Modal`, `Input`) ported from the
  Doco suite pattern.
- IndexedDB schema stood up via `idb` (`costdoco-db`).
- Installable, offline-capable PWA shell.
- `@llamaindex/liteparse-wasm` pinned to `wasm-v2.14.0`.

### Phase 1 — Data model & manual entry MVP
- Nested Groups/Subgroups and Cost Codes (CRUD).
- Full `Receipt` schema: date, vendor, group/code, receipt number, generic
  `customFields`, note, per-receipt tax mode (header/itemized), line items,
  currency + optional `convertedAmount`, billable flag.
- Capture flow (photo or file upload), manual 4-point crop, multi-page
  capture.
- Manual entry form with every field optional except date — never gated
  behind OCR.
- Receipt list view with group/code filtering.

### Phase 2 — OCR & compression pipeline
- OCR pipeline (`src/ocr/`) built around what `liteparse-wasm` actually does
  (a PDF text-layer parser, not an image encoder — see Known Gaps for how
  this deviated from the original plan): `jsPDF` builds the page images into
  a PDF, `liteparse-wasm` decides which pages need OCR, `tesseract.js` runs
  recognition on those pages only.
- Field-matching heuristic (`src/ocr/fieldMatch.ts`) pre-fills totals/tax
  fields from OCR'd text near keywords, never blocking manual entry.
- Correction UI (`OcrReview.tsx`) shows OCR'd text beside the source image.
- Compression preview with quality presets and live size estimates.
- Duplicate detection (vendor/date/total fuzzy match + PDF hash) as a
  non-blocking warning.
- `liteparse-wasm`'s ~5.5MB `.wasm` binary and tesseract's assets are
  lazy-loaded on first OCR use and cached at runtime, not precached at
  install — confirmed via production build output.

### Phase 3 — Reporting, export & backup
- Report filters: date range, group, code, billable-only.
- Generic CSV export (one row per line item) and a `jsPDF`-based summary
  report, both currency-aware (see Phase 6 below).
- Zip backup (PDFs + `manifest.json`) via `fflate`, and restore with
  duplicate-detection on import rather than silent overwrite.
- `navigator.storage.persist()` requested on first run; storage usage shown
  in Settings.
- Dashboard banner reminding the user to back up after a configurable
  threshold (default 30 days).

### Phase 4 — Security
- Optional encryption at rest: `PBKDF2` + `AES-GCM` via the Web Crypto API,
  no new dependency.
- Enabling encryption requires typing a confirmation phrase (not a
  checkbox) — the "this cannot be recovered" warning is unmissable by
  design.
- `id`/`groupId`/`codeId`/`date` stay unencrypted for indexing; everything
  else (vendor, note, amounts, receipt number, custom fields, the PDF
  itself) is encrypted.
- Turning encryption on/off migrates all existing records; zip backup/restore
  round-trips encrypted data correctly, passphrase requirement stated in the
  UI.

### Phase 5 — Stretch enhancements
Shipped:
- **Vendor memory / cost-code auto-suggest** (`src/utils/vendorMemory.ts`):
  suggests a cost code on `ReceiptForm` based on how past receipts from a
  closely-matching vendor were coded — suggestion only, applied via an
  explicit "Use this code" button.
- **Named CSV export templates** (`src/utils/csvTemplates.ts`): generic
  export plus Xero (Bills import) and QuickBooks (Banking import) column
  layouts, selectable from Reports.

Left open (reasons recorded in `docs/implementation/05-stretch-enhancements.md`):
- Auto-crop/perspective correction — no CV dependency added yet, to keep the
  bundle dependency-light.
- OCR-assisted line-item detection — needs accuracy validation against real
  messy receipts before it's worth building.

### Phase 6 — Open questions resolved
All eight decisions from `PROJECT_PLAN.md` §8 verified consistent across
docs and code: hosting as a same-origin subpath (`/costs/`, distinct PWA
scope and IndexedDB name), the `wasm-v2.14.0` version pin, one built-in
`receiptNumber` field plus generic `customFields` (no hard-coded vendor tax
field), per-receipt currency with optional manual `convertedAmount` (report
totals sum converted amounts and keep un-converted foreign-currency
receipts in a separate, clearly labelled subtotal), the typed-confirmation
encryption flow, the Bridge split out into its own deferred Phase 7, CSV
staying generic for v1 with named templates as a stretch add-on, and
"Uncategorized" being a UI-only bucket rather than a seeded record.

---

## Known gaps (real, not yet resolved)

These are places where a phase's Definition of Done was met on paper but a
genuine risk remains — recorded here so they don't get lost:

1. **No OCR spike against real receipt photos.** Phase 0 called for running
   the pipeline against 15–20 real sample photos and recording real
   accuracy/timing numbers. That never happened (no real receipt photos were
   available in this environment) — see `docs/ocr-spike-results.md`. Phase 2
   was built directly against the real npm packages instead, and
   `fieldMatch.ts`'s matching *logic* is unit-tested against hand-built OCR
   output, but tesseract's actual recognition quality on messy real-world
   input (thermal fade, skew, crumpled paper, low light) has **not** been
   validated. Manual entry always works regardless, so this is a quality/UX
   risk, not a blocking one.
2. **tesseract.js is not self-hosted — accepted, not a gap.** `src/ocr/tesseractEngine.ts`
   uses tesseract.js's default CDN-hosted core/worker/lang-data files rather
   than self-hosting them. This is a deliberate decision: manual entry is
   always available regardless of OCR, so needing a network connection the
   first time OCR runs is a degraded experience, not a broken one, and no
   receipt data is sent to that CDN. The `ocrEnabled` setting (Settings →
   OCR-Assisted Entry) states this plainly to the user and doubles as a full
   kill switch — turning it off skips the OCR pipeline entirely, so it can be
   disabled without a code change if real-world testing shows it's not
   pulling its weight. See `docs/ocr-spike-results.md`.
3. **Deployment/infra for the `/costs/` subpath is not scoped.** Phase 6
   confirmed the hosting *model* (same-origin subpath) and the app is built
   to support it, but routing `timedoco.com/costs/*` to this build's output
   is explicitly flagged as an infrastructure task for whoever owns that
   deployment platform, not app code.
4. **Production bundle has a large chunk.** `npm run build` warns about a
   ~778KB (gzip ~256KB) main chunk. Not a functional issue, but worth
   revisiting with code-splitting if initial load time becomes a concern.

## What's left to do

- **Phase 7 — Doco Suite Bridge**: deliberately unscoped. Per the plan, this
  should only be picked up once Phases 0–6 have been stable in production
  and the same-domain hosting from Phase 6 is confirmed for real (not just
  designed for).
- Source real sample receipts to validate/tune OCR accuracy — the one real
  remaining OCR gap (#1 above). Once there's real-world usage data, decide
  whether the field-matching heuristic needs work (confidence gating,
  locale-aware number parsing, an actual settings-backed keyword list) or
  whether the `ocrEnabled` kill switch is the simpler answer for cases where
  it doesn't hold up.
- Decide whether the CSV/Xero/QuickBooks templates need real-world
  validation against an actual import too.
- Revisit the two left-open Phase 5 stretch candidates (auto-crop, OCR
  line-item detection) only if they become an actual pain point in use —
  neither is required for feature-completeness.
- The `/costs/` subpath deployment routing itself, whenever the hosting
  platform is decided.
