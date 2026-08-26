import type { CostCode, CustomFieldDefinition, Group, Receipt } from '../types';
import { taxAmount } from '../types';

function escapeCSV(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const num = (n: number | undefined) => (n == null ? '' : n.toFixed(2));

/**
 * One row per line item (a header-mode receipt exports 1 row; an itemized one
 * exports N), with a shared `receiptId` column so rows can be regrouped.
 * Generic column set for v1, per PROJECT_PLAN.md §8.7 — named accounting-tool
 * templates are a Phase 5 stretch candidate, not required here.
 */
export function buildReceiptsCsv(
  receipts: Receipt[],
  groups: Group[],
  costCodes: CostCode[],
  customFieldDefinitions: CustomFieldDefinition[]
): string {
  const groupName = (id?: string) => (id ? groups.find((g) => g.id === id)?.name ?? '' : 'Uncategorized');
  const codeName = (id?: string) => (id ? costCodes.find((c) => c.id === id)?.name ?? '' : '');

  const headers = [
    'receiptId',
    'date',
    'vendor',
    'description',
    'amountExTax',
    'taxAmount',
    'amountIncTax',
    'currency',
    'convertedAmount',
    'group',
    'code',
    'receiptNumber',
    ...customFieldDefinitions.map((d) => d.label),
  ];

  const rows: string[] = [headers.map(escapeCSV).join(',')];

  for (const receipt of receipts) {
    for (const item of receipt.lineItems) {
      const row = [
        receipt.id,
        receipt.date,
        receipt.vendor ?? '',
        item.description ?? '',
        num(item.amountExTax),
        num(taxAmount(item)),
        num(item.amountIncTax),
        receipt.currency,
        num(receipt.convertedAmount),
        groupName(receipt.groupId),
        codeName(receipt.codeId),
        receipt.receiptNumber ?? '',
        ...customFieldDefinitions.map((d) => receipt.customFields?.[d.id] ?? ''),
      ];
      rows.push(row.map(escapeCSV).join(','));
    }
  }

  return rows.join('\n');
}
