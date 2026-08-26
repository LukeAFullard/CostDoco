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
  // Phase 1: raw cropped page bytes, stored directly as the placeholder document.
  // Phase 2 replaces this with the real compressed PDF from the liteparse pipeline.
  // TODO(phase-2): replace with the merged, compressed PDF blob ref.
  pdfBlobRef: string;
  pageBlobRefs: string[]; // one entry per captured page, in order
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
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
