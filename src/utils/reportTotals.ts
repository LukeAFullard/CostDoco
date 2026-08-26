import type { CostCode, Group, Receipt } from '../types';
import { receiptTotalIncTax } from '../types';

/** A receipt's contribution to the home-currency total, or undefined if it can't be included yet. */
function homeCurrencyAmount(receipt: Receipt, homeCurrency: string): number | undefined {
  if (receipt.currency === homeCurrency) return receiptTotalIncTax(receipt);
  return receipt.convertedAmount;
}

export interface ReportTotals {
  convertedTotal: number; // sum in homeCurrency
  convertedReceiptCount: number;
  /** Foreign-currency receipts with no convertedAmount entered — excluded from the
   * total above and listed separately, never silently mixed in (per the plan). */
  unconverted: Receipt[];
}

export function computeReportTotals(receipts: Receipt[], homeCurrency: string): ReportTotals {
  let convertedTotal = 0;
  let convertedReceiptCount = 0;
  const unconverted: Receipt[] = [];

  for (const receipt of receipts) {
    const amount = homeCurrencyAmount(receipt, homeCurrency);
    if (amount == null) {
      unconverted.push(receipt);
    } else {
      convertedTotal += amount;
      convertedReceiptCount += 1;
    }
  }

  return { convertedTotal, convertedReceiptCount, unconverted };
}

export interface GroupedTotal {
  key: string;
  label: string;
  total: number; // homeCurrency, excludes unconverted receipts
  receiptCount: number;
}

function groupTotals(receipts: Receipt[], homeCurrency: string, keyOf: (r: Receipt) => string, labelOf: (key: string) => string): GroupedTotal[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const receipt of receipts) {
    const amount = homeCurrencyAmount(receipt, homeCurrency);
    if (amount == null) continue;
    const key = keyOf(receipt);
    const existing = totals.get(key) ?? { total: 0, count: 0 };
    existing.total += amount;
    existing.count += 1;
    totals.set(key, existing);
  }
  return Array.from(totals.entries())
    .map(([key, { total, count }]) => ({ key, label: labelOf(key), total, receiptCount: count }))
    .sort((a, b) => b.total - a.total);
}

const UNCATEGORIZED = '__uncategorized__';
const NO_CODE = '__no-code__';

export function groupTotalsByGroup(receipts: Receipt[], groups: Group[], homeCurrency: string): GroupedTotal[] {
  const nameById = new Map(groups.map((g) => [g.id, g.name]));
  return groupTotals(
    receipts,
    homeCurrency,
    (r) => r.groupId ?? UNCATEGORIZED,
    (key) => (key === UNCATEGORIZED ? 'Uncategorized' : nameById.get(key) ?? 'Unknown group')
  );
}

export function groupTotalsByCode(receipts: Receipt[], costCodes: CostCode[], homeCurrency: string): GroupedTotal[] {
  const nameById = new Map(costCodes.map((c) => [c.id, c.name]));
  return groupTotals(
    receipts,
    homeCurrency,
    (r) => r.codeId ?? NO_CODE,
    (key) => (key === NO_CODE ? 'No code' : nameById.get(key) ?? 'Unknown code')
  );
}
