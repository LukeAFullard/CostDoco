# Phase 1 — Data Model & Manual Entry MVP

**Goal:** a fully usable app with zero OCR — capture, crop, categorise, and manually record a receipt end-to-end.

**Depends on:** Phase 0.

## Steps

1. **Groups & Subgroups**
   - Port TimeDoco's `GroupingManagement` pattern: nested groups, CRUD, assign receipts to a group/subgroup.

2. **Cost Codes**
   - Same pattern as TimeDoco's time codes: CRUD, optionally scoped to a group.
   - These are a local implementation of the same *concept*, not automatically shared data with TimeDoco (IndexedDB is origin-scoped) — see `PROJECT_PLAN.md` §8.6.

3. **Define the `Receipt` schema**
   - Core shape (illustrative, not final):
     ```ts
     interface Receipt {
       id: string;
       groupId?: string; // undefined = "Uncategorized" at the UI layer, no seeded record
       codeId?: string;
       date: string;
       vendor?: string;
       receiptNumber?: string; // the one built-in reference field
       customFields?: Record<string, string>; // user-defined extra fields
       note?: string;
       taxMode: 'header' | 'itemized';
       lineItems: LineItem[]; // always >= 1; header mode = exactly 1
       currency: string; // transaction currency, as printed on the receipt
       convertedAmount?: number; // manual home-currency equivalent, optional
       billable: boolean; // for Phase 7 Bridge use
       pdfBlobRef: string;
       ocrBoxes?: OcrBox[]; // populated in Phase 2
     }
     interface LineItem {
       description?: string;
       amountExTax?: number;
       amountIncTax?: number;
     }
     ```
   - Derive tax amount as `amountIncTax - amountExTax` at read time rather than storing it, to avoid rounding drift on edits.
   - Group/code are optional — an uncategorised receipt is valid; "Uncategorized" is rendered by the UI for `groupId: undefined`, not a real seeded group record.
   - Add a `homeCurrency` field to the `settings` store (single reporting currency). When a receipt's `currency` differs from it, prompt (optionally, never mandatory) for `convertedAmount`.
   - Add a `customFieldDefinitions: { id: string; label: string }[]` list to `settings`. Build a small management UI (add/rename/remove a definition) — this is what backs the `customFields` bag on each receipt, matching TimeDoco's existing custom-field pattern.

4. **Capture flow**
   - "Take Photo" (`<input capture="environment">` or `getUserMedia`) and "Upload File" (accepts `image/*` and `application/pdf`) as two explicit entry points.

5. **Manual crop**
   - Simple 4-corner draggable overlay on the captured image; canvas-based crop to a rectangle. No perspective correction (non-goal, §6).

6. **Multi-page capture**
   - "Add another page" before finalizing; store each page's cropped image in sequence, to be merged into one PDF in Phase 2.

7. **Manual entry form**
   - All `Receipt` fields above, editable, all optional except `date` and `taxMode`.
   - Tax-mode toggle: defaults to `header` (single implicit line item); switching to `itemized` reveals an "add line" control.
   - Render one input per entry in `customFieldDefinitions`, populating `customFields`; include an inline "add a field" action that creates a new definition on the fly rather than forcing a trip to settings.
   - If `currency` differs from `settings.homeCurrency`, show an optional `convertedAmount` input alongside the total.

8. **Temporary storage shim**
   - For this phase only: store the raw cropped image bytes directly as `pdfBlobRef`. Phase 2 replaces this with the real compressed PDF from the liteparse pipeline — flag this in code with a `// TODO(phase-2)` comment so it isn't missed.

9. **Receipt list view**
   - List per group/code, sorted by date, showing vendor/total/date at a glance.

## Definition of Done
- A user can capture or upload, crop, multi-page, categorise, fill in every field manually, save, and see the receipt in a list — without OCR touching any part of the flow.
