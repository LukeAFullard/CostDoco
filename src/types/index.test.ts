import { describe, expect, it } from 'vitest';
import { receiptTotalExTax, receiptTotalIncTax, taxAmount, type Receipt } from './index';

describe('taxAmount', () => {
  it('derives the tax amount from inc/ex tax', () => {
    expect(taxAmount({ amountExTax: 10, amountIncTax: 11.5 })).toBeCloseTo(1.5);
  });

  it('returns undefined when either amount is missing', () => {
    expect(taxAmount({ amountExTax: 10 })).toBeUndefined();
    expect(taxAmount({ amountIncTax: 10 })).toBeUndefined();
    expect(taxAmount({})).toBeUndefined();
  });
});

describe('receiptTotalIncTax / receiptTotalExTax', () => {
  const receipt: Pick<Receipt, 'lineItems'> = {
    lineItems: [
      { id: '1', amountExTax: 10, amountIncTax: 11 },
      { id: '2', amountExTax: 5 }, // no inc-tax entered — falls back to ex-tax
      { id: '3', amountIncTax: 8 }, // no ex-tax entered — falls back to inc-tax
    ],
  };

  it('sums inc-tax amounts, falling back to ex-tax when inc-tax is missing', () => {
    expect(receiptTotalIncTax(receipt)).toBe(11 + 5 + 8);
  });

  it('sums ex-tax amounts, falling back to inc-tax when ex-tax is missing', () => {
    expect(receiptTotalExTax(receipt)).toBe(10 + 5 + 8);
  });

  it('treats an empty line item as zero', () => {
    expect(receiptTotalIncTax({ lineItems: [{ id: '1' }] })).toBe(0);
  });
});
