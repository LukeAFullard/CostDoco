import { describe, expect, it } from 'vitest';
import { suggestCodeForVendor } from './vendorMemory';

describe('suggestCodeForVendor', () => {
  it('returns undefined for empty vendor text', () => {
    expect(suggestCodeForVendor('', [{ vendor: 'Staples', codeId: 'office' }])).toBeUndefined();
    expect(suggestCodeForVendor('   ', [{ vendor: 'Staples', codeId: 'office' }])).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(suggestCodeForVendor('Uber', [{ vendor: 'Staples', codeId: 'office' }])).toBeUndefined();
  });

  it('matches on an exact, case/whitespace-insensitive vendor name', () => {
    const result = suggestCodeForVendor('  staples  ', [{ vendor: 'Staples', codeId: 'office' }]);
    expect(result).toEqual({ codeId: 'office', matchedVendor: 'Staples', count: 1 });
  });

  it('matches a close variant (substring) of a past vendor', () => {
    const result = suggestCodeForVendor('Staples Inc', [{ vendor: 'Staples', codeId: 'office' }]);
    expect(result?.codeId).toBe('office');
  });

  it('does not match on very short strings', () => {
    expect(suggestCodeForVendor('Co', [{ vendor: 'Costco', codeId: 'groceries' }])).toBeUndefined();
  });

  it('ignores past receipts with no vendor or no code', () => {
    const result = suggestCodeForVendor('Staples', [
      { vendor: 'Staples', codeId: undefined },
      { vendor: undefined, codeId: 'office' },
    ]);
    expect(result).toBeUndefined();
  });

  it('picks the most frequently used code among matches', () => {
    const result = suggestCodeForVendor('Staples', [
      { vendor: 'Staples', codeId: 'office' },
      { vendor: 'Staples', codeId: 'office' },
      { vendor: 'Staples', codeId: 'misc' },
    ]);
    expect(result).toEqual({ codeId: 'office', matchedVendor: 'Staples', count: 2 });
  });
});
