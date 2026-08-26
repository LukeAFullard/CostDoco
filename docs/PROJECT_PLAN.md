# CostDoco — Project Plan

**The third app in the Doco suite.** A privacy-first, 100% client-side receipt and expense-tracking app — sits alongside TimeDoco (time) and NoteDoco (notes/checklists) as the third leg of "run your freelance business locally, for free."

---

## 1. Vision

> Capture a receipt, tag it to a project and a cost code, and never open a spreadsheet again — while every dollar and every document stays on your own device.

**Primary audience:** the same freelancers/contractors already served by TimeDoco and NoteDoco — people who need to track expenses against client projects (for reimbursement, cost-plus billing, or their own tax return) without a subscription or a cloud account.

**Design mandate:** same as the rest of the suite — simple by default, powerful when you dig. OCR and compression are conveniences, not requirements; every field must remain manually editable and leavable-blank.

**Scope, v1:** expenses only (money you spend). Invoices you send to clients (money you're owed) are explicitly out of scope — see §6.

---

## 2. Design & Style Guide

Visually a sibling of TimeDoco and NoteDoco — reuse, don't reinvent.

### 2.1 Brand relationship
- Same "analog ledger" materiality, same shared UI primitives (`Panel`, `Button`, `Modal`, `Input`).
- **Default to light mode**, matching TimeDoco — CostDoco is a records/audit tool in the same register as a timesheet, not a calm-writing tool like NoteDoco. Dark mode available via the same toggle pattern.

### 2.2 Colour tokens (inherited, unchanged)

| Token | Hex | Role in CostDoco |
|---|---|---|
| `ink` | `#10161C` | Dark-mode base |
| `stone` | `#EEF0EC` | Paper / light-mode base |
| `graphite` | `#26313A` | Panel surface (dark) / text (light) |
| `signal` (amber) | `#D9A54A` / dim `#8A6A2F` | Needs-review OCR fields, due/upcoming |
| `verdigris` (teal) | `#3E7368` / dim `#295148` | Verified/complete, successful sync |
| `rust` | `#B85C3E` | Overdue, destructive actions, duplicate warnings |

No new colours.

### 2.3 Typography
IBM Plex Sans (UI) / IBM Plex Mono (amounts, dates, receipt numbers — `tabular-nums`).

---

## 3. Core Feature Set (baseline)

- **Groups / Subgroups** — nested project grouping, same model as TimeDoco's `GroupingManagement`.
- **Cost Codes** — same pattern as TimeDoco's time codes; assign a receipt to a code.
- **Receipt capture** — photograph or upload a file; manual 4-point crop.
- **Manual fields, always available, always optional** — price ex-tax, price inc-tax, receipt/invoice number, vendor tax/GST number, item note. Never gated behind OCR succeeding.
- **Per-receipt tax mode** — header-level (one total) or itemized (per-line), user's choice per receipt.
- **Multi-page capture** — add pages before finalizing a receipt.
- Local IndexedDB storage, zip backup/restore, offline PWA, installable — same non-negotiables as the rest of the suite.

---

## 4. Signature Features

### 4.1 OCR-assisted entry with visible correction
Photo/PDF → OCR (via `liteparse-wasm` + `tesseract.js`) → extracted text rendered beside the original at matching positions, editable inline. OCR pre-fills the total/tax fields when confident; never blocks manual entry.

### 4.2 Compression with a trust-building preview
Before committing, the user sees the actual compressed PDF at true size, auto-zoomed to the total and tax-number regions specifically, with 2–3 preset quality levels and file-size estimates. Only the compressed PDF and the extracted data are kept — the original photo/PDF is discarded after the user confirms it's legible.

### 4.3 Doco Suite Bridge (Phase 4+)
A `billable` flag on receipts lets them feed into NoteDoco's Project Close-Out Report alongside time and checklist data — a report only the suite, not any single app, can produce. Mechanism (same-origin vs. explicit export/import) is an open question shared with NoteDoco's own plan — see §8.6.

### 4.4 Local encryption at rest
Receipts carry more sensitive data (partial card numbers, addresses) than notes or time entries. Optional passphrase-derived encryption (Web Crypto API — `PBKDF2` + `AES-GCM`, no new dependency) for the IndexedDB payload.

---

## 5. Technical Requirements

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS — matching the rest of the suite.
- **Storage:** IndexedDB via `idb`; request persistent storage (`navigator.storage.persist()`) on first run given heavier binary payloads than TimeDoco/NoteDoco.
- **OCR/PDF pipeline:** `@llamaindex/liteparse-wasm`, pinned to a confirmed stable release ≥ `wasm-v2.8.1` (pure-Rust image→PDF, no ImageMagick dependency) — verify the current latest stable at implementation time. OCR recognition is supplied via a `tesseract.js`-backed callback; liteparse does not bundle OCR in the WASM build.
- **Backup:** zip export, not JSON — binary PDFs don't belong base64-encoded in JSON. Bundle a `manifest.json` index inside the zip so the archive stays self-describing outside the app.
- **PDF report generation:** reuse `jsPDF`, matching TimeDoco's existing export code.
- **Testing:** Vitest + Testing Library + Oxlint, matching the suite's existing bar.
- **PWA:** installable, full offline function, responsive across breakpoints, touch-friendly capture/crop targets.

---

## 6. Non-Goals (v1)

- Invoices you send to clients (income tracking) — a possible future sibling app, not this one.
- Cloud accounts, hosted sync, real-time collaboration.
- Vendor memory / auto-suggested codes from past receipts.
- Auto perspective-correction or edge-detection cropping — v1 crop is manual.
- OCR-driven automatic line-item detection — itemized mode is manually entered; OCR only assists the header total.
- Full double-entry bookkeeping — this is capture and reporting, not accounting software.

---

## 7. Phased Roadmap

- [ ] **Phase 0 — Foundation:** repo scaffold, shared tokens/components, IndexedDB schema, PWA shell, OCR feasibility spike. → `docs/implementation/00-foundation.md`
- [ ] **Phase 1 — Capture & manual entry MVP:** groups, cost codes, capture/crop, full manual entry, no OCR yet. → `docs/implementation/01-data-model-and-manual-entry.md`
- [ ] **Phase 2 — OCR & compression:** liteparse/tesseract pipeline, correction UI, compression preview, duplicate detection. → `docs/implementation/02-ocr-compression-pipeline.md`
- [ ] **Phase 3 — Reporting & backup:** CSV export, PDF summary report, zip backup/restore, persistent storage, backup reminders. → `docs/implementation/03-reporting-export-backup.md`
- [ ] **Phase 4 — Security & Bridge:** encryption at rest, billable flag wiring, Doco Suite Bridge hand-off mechanism.
- [ ] **Phase 5 — Stretch:** auto-crop/perspective correction, vendor memory, OCR-assisted line-item detection, multi-currency refinements.

---

## 8. Open Questions

1. **Name/domain:** confirm `costdoco.com` (or equivalent) is available; no trademark conflict identified but not exhaustively checked.
2. **liteparse-wasm version:** pin the current latest stable ≥ `wasm-v2.8.1` at implementation time — verify via `npm view @llamaindex/liteparse-wasm versions`.
3. **Receipt number vs. tax number:** one field or two? (Vendor invoice number vs. vendor's GST/VAT registration number serve different purposes.)
4. **Currency:** reuse TimeDoco's rate/currency settings model, or standalone per-receipt currency?
5. **Encryption UX:** if the passphrase is forgotten, is data permanently unrecoverable by design, or is there a recovery path that weakens the model? Needs an explicit decision, not a default.
6. **Bridge mechanism:** same-origin hosting vs. explicit export/import hand-off — same open question NoteDoco's plan raised; needs resolving before Phase 4.
7. **CSV export shape:** which accounting import format to target first (Xero, QuickBooks, generic)?
8. **Mandatory categorisation:** can a receipt be saved with no group/code ("Uncategorised"), or is one required?
