# Phase 3 — Reporting, Export & Backup

**Goal:** turn stored receipts into usable outputs, and make sure the user's data is never one browser-storage-eviction away from gone.

**Depends on:** Phase 1 (data model). Does not depend on Phase 2 — reporting should work even for a user who never uses OCR.

## Steps

1. **Report filters**
   - Date range, group/subgroup, code, billable-only toggle.

2. **CSV export**
   - One row per line item (a header-mode receipt exports 1 row; an itemized one exports N), with a shared `receiptId` column so rows can be regrouped.
   - Columns: date, vendor, description, amount ex tax, tax amount (derived), amount inc tax, currency, group, code, receipt number.
   - Confirm target accounting-import format (Xero/QuickBooks/generic) before finalizing headers — open question in `PROJECT_PLAN.md` §8.7.

3. **PDF summary report**
   - Reuse `jsPDF`, matching TimeDoco's existing export code/style.
   - Totals grouped by code/group, line-item detail table, optional appended receipt PDFs (user toggle).

4. **Zip backup export**
   - Bundle every receipt's PDF plus a `manifest.json` (schema version, export timestamp, index of receipt metadata → PDF filename) using a lightweight zip library (e.g. `fflate`).
   - This is the full-fidelity backup — distinct from the CSV/PDF reports above, which are lossy summaries.

5. **Zip restore/import**
   - Parse and validate `manifest.json` (check schema version).
   - Import as new records, running them through Phase 2's duplicate-detection check rather than silently overwriting existing data.

6. **Persistent storage**
   - Request `navigator.storage.persist()` on first run.
   - Surface current storage usage/quota in a settings screen.

7. **Backup reminder**
   - Track `lastBackupAt` in the `settings` store.
   - Show a dashboard banner (same visual pattern as an "Up Next"-style nudge) when it exceeds a configurable threshold, default 30 days.

## Definition of Done
- User can filter, export CSV, generate a PDF report, take a full zip backup, restore it on a clean install, and gets reminded if they haven't backed up in a while.
