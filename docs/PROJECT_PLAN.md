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

### 4.3 Doco Suite Bridge (Phase 7)
A `billable` flag on receipts lets them feed into NoteDoco's Project Close-Out Report alongside time and checklist data — a report only the suite, not any single app, can produce. Hosting is confirmed same-domain/same-origin (subpath, not subdomain — see §8.1), which makes a direct-access Bridge realistic, but the mechanism is deliberately unscoped until the rest of the app is stable — see §8.6 and Phase 7.

### 4.4 Local encryption at rest
Receipts carry more sensitive data (partial card numbers, addresses) than notes or time entries. Optional passphrase-derived encryption (Web Crypto API — `PBKDF2` + `AES-GCM`, no new dependency) for the IndexedDB payload.

---

## 5. Technical Requirements

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS — matching the rest of the suite.
- **Storage:** IndexedDB via `idb`; request persistent storage (`navigator.storage.persist()`) on first run given heavier binary payloads than TimeDoco/NoteDoco.
- **OCR/PDF pipeline:** `@llamaindex/liteparse-wasm`, pinned to `wasm-v2.14.0` (confirmed current as of Aug 2026; pure-Rust image→PDF, no ImageMagick dependency; includes memory optimisation during rasterization/OCR and worker-pool support — re-verify at implementation time in case of newer stable releases). OCR recognition is supplied via a `tesseract.js`-backed callback; liteparse does not bundle OCR in the WASM build.
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
- [ ] **Phase 4 — Security:** encryption at rest, billable flag wiring. → `docs/implementation/04-security-and-bridge.md`
- [ ] **Phase 5 — Stretch:** auto-crop/perspective correction, vendor memory, OCR-assisted line-item detection, named export templates. → `docs/implementation/05-stretch-enhancements.md`
- [ ] **Phase 6 — Open questions resolved:** hosting model, currency handling, custom fields, categorisation defaults, version pin. → `docs/implementation/06-open-questions-resolved.md`
- [ ] **Phase 7 — Suite Bridge:** deliberately deferred until Phases 0–6 are stable and same-domain hosting is confirmed in production. Not yet scoped.

---

## 8. Open Questions — Resolved

Full detail and resulting action items in `docs/implementation/06-open-questions-resolved.md`. Summary:

1. **Name/domain:** `timedoco.com/costs` — a subpath, same origin as TimeDoco (not a subdomain).
2. **liteparse-wasm version:** pinned to `wasm-v2.14.0`.
3. **Receipt number vs. tax number:** one built-in field (`receiptNumber`); additional fields (e.g. vendor tax number) via a user-defined custom-fields mechanism, matching TimeDoco's pattern.
4. **Currency:** per-receipt transaction currency kept as-is; optional manually-entered `convertedAmount` in the user's home currency for consistent reporting. No live rate lookups.
5. **Encryption UX:** not recoverable by design — the enable flow requires a typed confirmation, not just a checkbox.
6. **Bridge mechanism:** same-origin hosting confirmed, but the Bridge itself is deliberately deferred to Phase 7, built last.
7. **CSV export shape:** generic for v1; named accounting-tool templates are a Phase 5 stretch candidate.
8. **Mandatory categorisation:** not required — "Uncategorized" is a UI-level bucket for receipts with no group, not a seeded database record.
