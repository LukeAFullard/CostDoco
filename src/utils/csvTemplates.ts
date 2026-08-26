import type { CostCode, CustomFieldDefinition, Group, Receipt } from '../types';
import { buildReceiptsCsv } from './csv';
import { escapeCSV, formatNum as num, groupNameOf, codeNameOf } from './csvFormat';

/**
 * Named export templates (Phase 5, PROJECT_PLAN.md §7 candidate 4 / former
 * open question §8.7). Each is purely a column-formatting layer over the same
 * receipt data — no schema change. Column layouts approximate each tool's
 * commonly-documented generic CSV import screen; verify against your own
 * org's setup (account codes, tax rates) before importing.
 */

/**
 * Approximates Xero's "Bills" CSV import layout (Contacts > Bills to pay >
 * Import). Column order and required (*) fields match Xero's own template.
 * TaxType is left blank — it depends on the org's configured tax rates, and
 * Xero's importer lets a default be chosen at import time. AccountCode is
 * populated from the cost code name; it must match a code already in the
 * target Xero chart of accounts.
 */
function buildXeroBillsCsv(receipts: Receipt[], groups: Group[], costCodes: CostCode[]): string {
  const headers = [
    '*ContactName',
    '*InvoiceNumber',
    '*InvoiceDate',
    '*DueDate',
    '*Description',
    '*Quantity',
    '*UnitAmount',
    '*AccountCode',
    'TaxType',
    'Currency',
  ];
  const rows: string[] = [headers.map(escapeCSV).join(',')];

  for (const receipt of receipts) {
    for (const item of receipt.lineItems) {
      const row = [
        receipt.vendor || 'Unknown vendor',
        receipt.receiptNumber || receipt.id,
        receipt.date,
        receipt.date,
        item.description || codeNameOf(costCodes, receipt.codeId) || groupNameOf(groups, receipt.groupId) || 'Expense',
        '1',
        num(item.amountExTax ?? item.amountIncTax),
        codeNameOf(costCodes, receipt.codeId) || 'Uncoded',
        '',
        receipt.currency,
      ];
      rows.push(row.map(escapeCSV).join(','));
    }
  }
  return rows.join('\n');
}

/**
 * Approximates QuickBooks Online's generic 3-column banking CSV import
 * (Date, Description, Amount) used on the "Upload transactions" screen.
 * Expense amounts are exported as negative, the sign convention QuickBooks'
 * own help docs use for "money out" in a 3-column file.
 */
function buildQuickBooksBankingCsv(receipts: Receipt[], groups: Group[], costCodes: CostCode[]): string {
  const headers = ['Date', 'Description', 'Amount'];
  const rows: string[] = [headers.map(escapeCSV).join(',')];

  for (const receipt of receipts) {
    for (const item of receipt.lineItems) {
      const amount = item.amountIncTax ?? item.amountExTax ?? 0;
      const description =
        [receipt.vendor, item.description, codeNameOf(costCodes, receipt.codeId) || groupNameOf(groups, receipt.groupId)]
          .filter(Boolean)
          .join(' — ') || 'Expense';
      const row = [receipt.date, description, num(-Math.abs(amount))];
      rows.push(row.map(escapeCSV).join(','));
    }
  }
  return rows.join('\n');
}

export type CsvTemplateId = 'generic' | 'xero-bills' | 'quickbooks-banking';

export interface CsvTemplate {
  id: CsvTemplateId;
  label: string;
  description: string;
  build: (
    receipts: Receipt[],
    groups: Group[],
    costCodes: CostCode[],
    customFieldDefinitions: CustomFieldDefinition[]
  ) => string;
}

export const CSV_TEMPLATES: CsvTemplate[] = [
  {
    id: 'generic',
    label: 'Generic (CostDoco)',
    description: 'One row per line item, every field including custom fields — the full data export.',
    build: buildReceiptsCsv,
  },
  {
    id: 'xero-bills',
    label: 'Xero (Bills import)',
    description: "Matches Xero's Bills CSV import layout. Account codes must already exist in your Xero chart of accounts.",
    build: (receipts, groups, costCodes) => buildXeroBillsCsv(receipts, groups, costCodes),
  },
  {
    id: 'quickbooks-banking',
    label: 'QuickBooks (Banking import)',
    description: 'Generic 3-column Date / Description / Amount layout for QuickBooks Online banking CSV import.',
    build: (receipts, groups, costCodes) => buildQuickBooksBankingCsv(receipts, groups, costCodes),
  },
];
