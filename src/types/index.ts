export interface Group {
  id: string; // UUID
  name: string;
  color: string; // hex
  parentId: string | null; // null = top-level group; supports nested subgroups
  archived: boolean;
  updatedAt: string; // ISO datetime
}

export interface CostCode {
  id: string; // UUID
  name: string;
  groupId: string | null; // optionally scoped to a group; null = ungrouped
  color?: string; // hex, optional override
  archived: boolean;
  updatedAt: string; // ISO datetime
}

export interface LineItem {
  id: string; // UUID, stable across edits for React keys
  description?: string;
  amountExTax?: number;
  amountIncTax?: number;
}

export type TaxMode = 'header' | 'itemized';

export interface Receipt {
  id: string; // UUID
  groupId?: string; // undefined = "Uncategorized" at the UI layer, no seeded record
  codeId?: string;
  date: string; // ISO date (yyyy-mm-dd)
  vendor?: string;
  receiptNumber?: string; // the one built-in reference field
  customFields?: Record<string, string>; // keyed by CustomFieldDefinition.id
  note?: string;
  taxMode: TaxMode;
  lineItems: LineItem[]; // always >= 1; header mode = exactly 1
  currency: string; // transaction currency, as printed on the receipt
  convertedAmount?: number; // manual home-currency equivalent, optional
  billable: boolean; // for the future Doco Suite Bridge (Phase 7)
  // The merged, compressed PDF built from pageBlobRefs (or the uploaded PDF as-is
  // when it already had a usable text layer). Falls back to the first raw page
  // blob for a receipt saved before the OCR/compression pipeline ran on it.
  pdfBlobRef: string;
  pageBlobRefs: string[]; // one entry per captured/uploaded page, in order
  ocrBoxes?: OcrBox[]; // OCR'd text + bounding boxes, kept for the correction UI
  pdfHash?: string; // SHA-256 of the final PDF bytes, used for duplicate detection
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** One OCR'd line of text and where it sits on its source page (see ocr/pipeline.ts). */
export interface OcrBox {
  page: number; // 0-indexed
  text: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] in the page's raster pixel space
  confidence: number; // 0..1
}

export interface ReceiptBlob {
  id: string; // UUID
  blob: Blob;
  mimeType: string;
  createdAt: string; // ISO datetime
}

export interface CustomFieldDefinition {
  id: string; // UUID
  label: string;
}

export interface Settings {
  id: 'app-settings';
  homeCurrency: string; // single reporting currency, e.g. "USD"
  customFieldDefinitions: CustomFieldDefinition[];
  theme: 'light' | 'dark' | 'system';
  lastBackupAt: string | null; // ISO datetime
  backupReminderDays: number;
  // Encryption at rest (Phase 4) — off by default. Never store the passphrase
  // or derived key here, only the parameters needed to re-derive the key and
  // to verify a re-entered passphrase is correct.
  encryptionEnabled: boolean;
  encryptionSalt?: string; // base64
  encryptionIterations?: number;
  encryptionVerifier?: { iv: string; ciphertext: string };
  // OCR-assisted entry (Phase 2) — on by default, but a user kill switch:
  // tesseract.js's recognition engine is fetched from a CDN on first OCR use
  // (not self-hosted, see docs/implementation/02-ocr-compression-pipeline.md),
  // so OCR needs a network connection the first time; manual entry always
  // works regardless. Optional so existing settings records (saved before
  // this field existed) are treated as enabled — see isOcrEnabled below.
  ocrEnabled?: boolean;
}

/** Derives the tax amount at read time rather than storing it, to avoid rounding drift on edits. */
export function taxAmount(item: Pick<LineItem, 'amountExTax' | 'amountIncTax'>): number | undefined {
  if (item.amountExTax == null || item.amountIncTax == null) return undefined;
  return item.amountIncTax - item.amountExTax;
}

export function receiptTotalIncTax(receipt: Pick<Receipt, 'lineItems'>): number {
  return receipt.lineItems.reduce((sum, li) => sum + (li.amountIncTax ?? li.amountExTax ?? 0), 0);
}

export function receiptTotalExTax(receipt: Pick<Receipt, 'lineItems'>): number {
  return receipt.lineItems.reduce((sum, li) => sum + (li.amountExTax ?? li.amountIncTax ?? 0), 0);
}

/** `ocrEnabled` defaults to on — undefined (settings saved before this field existed) counts as enabled. */
export function isOcrEnabled(settings: Pick<Settings, 'ocrEnabled'> | null | undefined): boolean {
  return settings?.ocrEnabled !== false;
}
