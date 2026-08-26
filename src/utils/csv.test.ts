import { describe, it, expect } from 'vitest';
import { buildReceiptsCsv } from './csv';
import type { CostCode, Group, Receipt } from '../types';

const now = new Date().toISOString();

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: 'r1',
  date: '2026-08-20',
  taxMode: 'header',
  lineItems: [{ id: 'li1', amountExTax: 10, amountIncTax: 11 }],
  currency: 'USD',
  billable: false,
  pdfBlobRef: 'b1',
  pageBlobRefs: ['b1'],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('buildReceiptsCsv', () => {
  it('emits one row per line item with a shared receiptId', () => {
    const receipt = makeReceipt({
      taxMode: 'itemized',
      lineItems: [
        { id: 'li1', description: 'Nails', amountExTax: 5, amountIncTax: 5.5 },
        { id: 'li2', description: 'Screws', amountExTax: 3, amountIncTax: 3.3 },
      ],
    });
    const csv = buildReceiptsCsv([receipt], [], [], []);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 line items
    expect(lines[1]).toContain('r1');
    expect(lines[1]).toContain('Nails');
    expect(lines[2]).toContain('r1');
    expect(lines[2]).toContain('Screws');
  });

  it('derives the tax amount from ex-tax/inc-tax rather than storing it', () => {
    const csv = buildReceiptsCsv([makeReceipt()], [], [], []);
    const [, dataRow] = csv.split('\n');
    const cols = dataRow.split(',');
    // header order: receiptId,date,vendor,description,amountExTax,taxAmount,amountIncTax,...
    expect(cols[4]).toBe('10.00');
    expect(cols[5]).toBe('1.00');
    expect(cols[6]).toBe('11.00');
  });

  it('resolves group and code names, labeling an ungrouped receipt as Uncategorized', () => {
    const groups: Group[] = [{ id: 'g1', name: 'Client A', color: '#000', parentId: null, archived: false, updatedAt: now }];
    const codes: CostCode[] = [{ id: 'c1', name: 'Materials', groupId: 'g1', archived: false, updatedAt: now }];

    const grouped = buildReceiptsCsv([makeReceipt({ groupId: 'g1', codeId: 'c1' })], groups, codes, []);
    expect(grouped.split('\n')[1]).toContain('Client A');
    expect(grouped.split('\n')[1]).toContain('Materials');

    const ungrouped = buildReceiptsCsv([makeReceipt()], groups, codes, []);
    expect(ungrouped.split('\n')[1]).toContain('Uncategorized');
  });

  it('adds one column per custom field definition, populated from the receipt', () => {
    const csv = buildReceiptsCsv(
      [makeReceipt({ customFields: { f1: 'GST-123' } })],
      [],
      [],
      [{ id: 'f1', label: 'Vendor Tax Number' }]
    );
    const [header, dataRow] = csv.split('\n');
    expect(header).toContain('Vendor Tax Number');
    expect(dataRow.endsWith('GST-123')).toBe(true);
  });

  it('leaves convertedAmount blank when not entered', () => {
    const csv = buildReceiptsCsv([makeReceipt()], [], [], []);
    const cols = csv.split('\n')[1].split(',');
    expect(cols[8]).toBe(''); // convertedAmount column
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = buildReceiptsCsv([makeReceipt({ vendor: 'Acme, "Best" Co.' })], [], [], []);
    expect(csv.split('\n')[1]).toContain('"Acme, ""Best"" Co."');
  });

  it('returns just the header row for an empty receipt list', () => {
    const csv = buildReceiptsCsv([], [], [], []);
    expect(csv.split('\n')).toHaveLength(1);
  });
});
