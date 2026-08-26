import { describe, it, expect } from 'vitest';
import { computeReportTotals, groupTotalsByCode, groupTotalsByGroup } from './reportTotals';
import type { CostCode, Group, Receipt } from '../types';

const now = new Date().toISOString();

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: crypto.randomUUID(),
  date: '2026-08-20',
  taxMode: 'header',
  lineItems: [{ id: crypto.randomUUID(), amountIncTax: 100 }],
  currency: 'USD',
  billable: false,
  pdfBlobRef: 'b1',
  pageBlobRefs: ['b1'],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('computeReportTotals', () => {
  it('sums the raw total for receipts already in the home currency', () => {
    const totals = computeReportTotals([makeReceipt({ currency: 'USD' })], 'USD');
    expect(totals.convertedTotal).toBe(100);
    expect(totals.convertedReceiptCount).toBe(1);
    expect(totals.unconverted).toHaveLength(0);
  });

  it('sums convertedAmount for a foreign-currency receipt that has one', () => {
    const totals = computeReportTotals([makeReceipt({ currency: 'EUR', convertedAmount: 110 })], 'USD');
    expect(totals.convertedTotal).toBe(110);
    expect(totals.convertedReceiptCount).toBe(1);
  });

  it('excludes a foreign-currency receipt with no convertedAmount from the total, listing it separately', () => {
    const receipt = makeReceipt({ currency: 'EUR' });
    const totals = computeReportTotals([receipt], 'USD');
    expect(totals.convertedTotal).toBe(0);
    expect(totals.convertedReceiptCount).toBe(0);
    expect(totals.unconverted).toEqual([receipt]);
  });

  it('never silently mixes an unconverted receipt into the total', () => {
    const totals = computeReportTotals(
      [makeReceipt({ currency: 'USD' }), makeReceipt({ currency: 'EUR' })],
      'USD'
    );
    expect(totals.convertedTotal).toBe(100);
    expect(totals.unconverted).toHaveLength(1);
  });
});

describe('groupTotalsByGroup', () => {
  const groups: Group[] = [{ id: 'g1', name: 'Client A', color: '#000', parentId: null, archived: false, updatedAt: now }];

  it('buckets an ungrouped receipt as Uncategorized', () => {
    const result = groupTotalsByGroup([makeReceipt()], groups, 'USD');
    expect(result).toEqual([{ key: '__uncategorized__', label: 'Uncategorized', total: 100, receiptCount: 1 }]);
  });

  it('resolves a known group name and sums multiple receipts in it', () => {
    const result = groupTotalsByGroup(
      [makeReceipt({ groupId: 'g1' }), makeReceipt({ groupId: 'g1', lineItems: [{ id: '2', amountIncTax: 50 }] })],
      groups,
      'USD'
    );
    expect(result).toEqual([{ key: 'g1', label: 'Client A', total: 150, receiptCount: 2 }]);
  });

  it('sorts groups by total descending', () => {
    const result = groupTotalsByGroup(
      [makeReceipt({ groupId: 'g1', lineItems: [{ id: '1', amountIncTax: 10 }] }), makeReceipt()],
      groups,
      'USD'
    );
    expect(result.map((r) => r.key)).toEqual(['__uncategorized__', 'g1']);
  });

  it('excludes unconverted foreign-currency receipts from any group total', () => {
    const result = groupTotalsByGroup([makeReceipt({ groupId: 'g1', currency: 'EUR' })], groups, 'USD');
    expect(result).toEqual([]);
  });
});

describe('groupTotalsByCode', () => {
  const codes: CostCode[] = [{ id: 'c1', name: 'Materials', groupId: null, archived: false, updatedAt: now }];

  it('buckets a receipt with no code as "No code"', () => {
    const result = groupTotalsByCode([makeReceipt()], codes, 'USD');
    expect(result).toEqual([{ key: '__no-code__', label: 'No code', total: 100, receiptCount: 1 }]);
  });

  it('resolves a known code name', () => {
    const result = groupTotalsByCode([makeReceipt({ codeId: 'c1' })], codes, 'USD');
    expect(result[0].label).toBe('Materials');
  });
});
