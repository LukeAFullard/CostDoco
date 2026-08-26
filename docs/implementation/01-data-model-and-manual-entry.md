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
       groupId?: string;
       codeId?: string;
       date: string;
       vendor?: string;
       receiptNumber?: string;
       vendorTaxNumber?: string;
       note?: string;
       taxMode: 'header' | 'itemized';
       lineItems: LineItem[]; // always >= 1; header mode = exactly 1
       currency: string;
       billable: boolean; // for Phase 4 Bridge use
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
   - Group/code are optional — an uncategorised receipt is valid (see open question §8.8; build it optional now, tighten later if the answer comes back "required").

4. **Capture flow**
   - "Take Photo" (`<input capture="environment">` or `getUserMedia`) and "Upload File" (accepts `image/*` and `application/pdf`) as two explicit entry points.

5. **Manual crop**
   - Simple 4-corner draggable overlay on the captured image; canvas-based crop to a rectangle. No perspective correction (non-goal, §6).

6. **Multi-page capture**
   - "Add another page" before finalizing; store each page's cropped image in sequence, to be merged into one PDF in Phase 2.

7. **Manual entry form**
   - All `Receipt` fields above, editable, all optional except `date` and `taxMode`.
   - Tax-mode toggle: defaults to `header` (single implicit line item); switching to `itemized` reveals an "add line" control.

8. **Temporary storage shim**
   - For this phase only: store the raw cropped image bytes directly as `pdfBlobRef`. Phase 2 replaces this with the real compressed PDF from the liteparse pipeline — flag this in code with a `// TODO(phase-2)` comment so it isn't missed.

9. **Receipt list view**
   - List per group/code, sorted by date, showing vendor/total/date at a glance.

## Definition of Done
- A user can capture or upload, crop, multi-page, categorise, fill in every field manually, save, and see the receipt in a list — without OCR touching any part of the flow.
