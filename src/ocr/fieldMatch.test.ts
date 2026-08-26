import { describe, it, expect } from 'vitest';
import { matchFields } from './fieldMatch';
import type { OcrBox } from '../types';

const box = (text: string, overrides: Partial<OcrBox> = {}): OcrBox => ({
  page: 0,
  text,
  bbox: [0, 0, 10, 10],
  confidence: 0.9,
  ...overrides,
});

describe('matchFields', () => {
  it('matches a total on the same line as the keyword', () => {
    const result = matchFields([box('Subtotal $10.00'), box('TOTAL $11.50')]);
    expect(result.amountIncTax?.value).toBe(11.5);
    expect(result.amountIncTax?.box.text).toBe('TOTAL $11.50');
  });

  it('matches a total on the line after a keyword-only line', () => {
    const result = matchFields([box('Total'), box('$42.00')]);
    expect(result.amountIncTax?.value).toBe(42);
  });

  it('prefers an explicit subtotal line for amountExTax', () => {
    const result = matchFields([box('Subtotal 10.00'), box('GST 1.50'), box('Total 11.50')]);
    expect(result.amountExTax?.value).toBe(10);
  });

  it('derives amountExTax from total minus tax when no subtotal line exists', () => {
    const result = matchFields([box('GST $1.50'), box('Total $11.50')]);
    expect(result.amountExTax?.value).toBeCloseTo(10);
  });

  it('is case-insensitive and matches keyword variants', () => {
    const result = matchFields([box('grand total: 99.99')]);
    expect(result.amountIncTax?.value).toBe(99.99);
  });

  it('returns undefined fields when nothing matches, without throwing', () => {
    const result = matchFields([box('Thank you for shopping'), box('Have a nice day')]);
    expect(result.amountIncTax).toBeUndefined();
    expect(result.amountExTax).toBeUndefined();
    expect(result.receiptNumber).toBeUndefined();
  });

  it('handles an empty item list', () => {
    expect(matchFields([])).toEqual({});
  });

  it('does not match a total across a page boundary', () => {
    const result = matchFields([box('Total', { page: 0 }), box('$42.00', { page: 1 })]);
    expect(result.amountIncTax).toBeUndefined();
  });

  it('matches a receipt number on the same line', () => {
    const result = matchFields([box('Receipt No: RN-4821')]);
    expect(result.receiptNumber?.value).toBe('RN-4821');
  });

  it('matches a receipt number on the following line', () => {
    const result = matchFields([box('Receipt Number'), box('RN-4821')]);
    expect(result.receiptNumber?.value).toBe('RN-4821');
  });

  it('handles thousands separators in amounts', () => {
    const result = matchFields([box('Total $1,234.56')]);
    expect(result.amountIncTax?.value).toBe(1234.56);
  });

  it('does not truncate a 4+ digit amount that has no thousands separator', () => {
    const result = matchFields([box('Total 1234.56')]);
    expect(result.amountIncTax?.value).toBe(1234.56);
  });
});
