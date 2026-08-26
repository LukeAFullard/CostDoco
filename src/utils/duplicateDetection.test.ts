import { describe, it, expect } from 'vitest';
import { findLikelyDuplicate, hashBlob } from './duplicateDetection';
import type { Receipt } from '../types';

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    date: '2026-08-20',
    vendor: 'Acme Hardware',
    taxMode: 'header',
    lineItems: [{ id: crypto.randomUUID(), amountIncTax: 42 }],
    currency: 'USD',
    billable: false,
    pdfBlobRef: 'b1',
    pageBlobRefs: ['b1'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

describe('findLikelyDuplicate', () => {
  it('flags an exact pdfHash match regardless of other fields', () => {
    const existing = [makeReceipt({ pdfHash: 'abc123', date: '2020-01-01', vendor: 'Other', lineItems: [] })];
    const found = findLikelyDuplicate({ date: '2026-08-20', totalIncTax: 42, pdfHash: 'abc123' }, existing);
    expect(found).toBe(existing[0]);
  });

  it('flags a fuzzy match on same date, vendor, and total', () => {
    const existing = [makeReceipt()];
    const found = findLikelyDuplicate({ date: '2026-08-20', vendor: '  ACME hardware  ', totalIncTax: 42 }, existing);
    expect(found).toBe(existing[0]);
  });

  it('does not flag when the date differs', () => {
    const existing = [makeReceipt()];
    const found = findLikelyDuplicate({ date: '2026-08-21', vendor: 'Acme Hardware', totalIncTax: 42 }, existing);
    expect(found).toBeUndefined();
  });

  it('does not flag when the total differs beyond rounding', () => {
    const existing = [makeReceipt()];
    const found = findLikelyDuplicate({ date: '2026-08-20', vendor: 'Acme Hardware', totalIncTax: 42.5 }, existing);
    expect(found).toBeUndefined();
  });

  it('does not flag when vendors differ', () => {
    const existing = [makeReceipt()];
    const found = findLikelyDuplicate({ date: '2026-08-20', vendor: 'Different Vendor', totalIncTax: 42 }, existing);
    expect(found).toBeUndefined();
  });

  it('flags same date and total when neither side has a vendor', () => {
    const existing = [makeReceipt({ vendor: undefined })];
    const found = findLikelyDuplicate({ date: '2026-08-20', totalIncTax: 42 }, existing);
    expect(found).toBe(existing[0]);
  });

  it('returns undefined against an empty list', () => {
    expect(findLikelyDuplicate({ date: '2026-08-20', totalIncTax: 42 }, [])).toBeUndefined();
  });
});

describe('hashBlob', () => {
  it('produces a stable 64-character hex digest for the same content', async () => {
    const a = await hashBlob(new Blob(['hello world']));
    const b = await hashBlob(new Blob(['hello world']));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different digests for different content', async () => {
    const a = await hashBlob(new Blob(['hello world']));
    const b = await hashBlob(new Blob(['goodbye world']));
    expect(a).not.toBe(b);
  });
});
