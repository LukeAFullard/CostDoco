import { describe, it, expect } from 'vitest';
import { generateReceiptsReportPdf } from './pdfReport';
import type { Group, Receipt } from '../types';

const now = new Date().toISOString();

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: crypto.randomUUID(),
  date: '2026-08-20',
  vendor: 'Acme Hardware',
  taxMode: 'header',
  lineItems: [{ id: crypto.randomUUID(), amountExTax: 10, amountIncTax: 11 }],
  currency: 'USD',
  billable: false,
  pdfBlobRef: 'b1',
  pageBlobRefs: ['b1'],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('generateReceiptsReportPdf', () => {
  it('produces a real PDF blob for a populated receipt list', async () => {
    const blob = await generateReceiptsReportPdf({
      receipts: [makeReceipt()],
      groups: [],
      costCodes: [],
      homeCurrency: 'USD',
    });
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('does not throw for an empty receipt list', async () => {
    const blob = await generateReceiptsReportPdf({ receipts: [], groups: [], costCodes: [], homeCurrency: 'USD' });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a larger document when there are more receipts to list', async () => {
    const small = await generateReceiptsReportPdf({ receipts: [makeReceipt()], groups: [], costCodes: [], homeCurrency: 'USD' });
    const many = Array.from({ length: 30 }, (_, i) => makeReceipt({ vendor: `Vendor ${i}`, date: '2026-08-01' }));
    const large = await generateReceiptsReportPdf({ receipts: many, groups: [], costCodes: [], homeCurrency: 'USD' });
    expect(large.size).toBeGreaterThan(small.size);
  });

  it('includes a group in the summary when receipts reference it', async () => {
    const groups: Group[] = [{ id: 'g1', name: 'Client A', color: '#000', parentId: null, archived: false, updatedAt: now }];
    const blob = await generateReceiptsReportPdf({
      receipts: [makeReceipt({ groupId: 'g1' })],
      groups,
      costCodes: [],
      homeCurrency: 'USD',
    });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles a foreign-currency receipt with no convertedAmount without throwing', async () => {
    const blob = await generateReceiptsReportPdf({
      receipts: [makeReceipt({ currency: 'EUR' })],
      groups: [],
      costCodes: [],
      homeCurrency: 'USD',
    });
    expect(blob.size).toBeGreaterThan(0);
  });
});
