import { describe, expect, it } from 'vitest';
import { CSV_TEMPLATES } from './csvTemplates';
import type { Group, CostCode, Receipt } from '../types';

const groups: Group[] = [{ id: 'g1', name: 'Client A', color: '#000', parentId: null, archived: false, updatedAt: '' }];
const costCodes: CostCode[] = [{ id: 'c1', name: 'Travel', groupId: 'g1', archived: false, updatedAt: '' }];

const receipt: Receipt = {
  id: 'r1',
  groupId: 'g1',
  codeId: 'c1',
  date: '2026-08-01',
  vendor: 'Acme Taxi',
  receiptNumber: 'INV-1',
  note: '',
  taxMode: 'header',
  lineItems: [{ id: 'li1', amountExTax: 90, amountIncTax: 100 }],
  currency: 'USD',
  billable: true,
  pdfBlobRef: 'blob1',
  pageBlobRefs: ['blob1'],
  createdAt: '',
  updatedAt: '',
};

function template(id: string) {
  const t = CSV_TEMPLATES.find((t) => t.id === id);
  if (!t) throw new Error(`missing template ${id}`);
  return t;
}

describe('CSV_TEMPLATES', () => {
  it('exposes generic, xero-bills, and quickbooks-banking templates', () => {
    expect(CSV_TEMPLATES.map((t) => t.id)).toEqual(['generic', 'xero-bills', 'quickbooks-banking']);
  });

  it('generic template delegates to buildReceiptsCsv', () => {
    const csv = template('generic').build([receipt], groups, costCodes, []);
    expect(csv).toContain('receiptId');
    expect(csv).toContain('Acme Taxi');
  });

  it('xero-bills template produces the required Xero Bills columns', () => {
    const csv = template('xero-bills').build([receipt], groups, costCodes, []);
    const [header, row] = csv.split('\n');
    expect(header).toBe('*ContactName,*InvoiceNumber,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,*AccountCode,TaxType,Currency');
    expect(row).toBe('Acme Taxi,INV-1,2026-08-01,2026-08-01,Travel,1,90.00,Travel,,USD');
  });

  it('falls back to a placeholder contact/account when vendor and code are missing', () => {
    const bare: Receipt = { ...receipt, vendor: undefined, codeId: undefined };
    const csv = template('xero-bills').build([bare], groups, costCodes, []);
    const [, row] = csv.split('\n');
    expect(row.startsWith('Unknown vendor,')).toBe(true);
    expect(row).toContain(',Uncoded,');
  });

  it('quickbooks-banking template exports Date/Description/Amount with expenses negative', () => {
    const csv = template('quickbooks-banking').build([receipt], groups, costCodes, []);
    const [header, row] = csv.split('\n');
    expect(header).toBe('Date,Description,Amount');
    expect(row).toBe('2026-08-01,Acme Taxi — Travel,-100.00');
  });

  it('quickbooks-banking amount is negative even when only amountExTax is set', () => {
    const exOnly: Receipt = { ...receipt, lineItems: [{ id: 'li1', amountExTax: 50 }] };
    const csv = template('quickbooks-banking').build([exOnly], groups, costCodes, []);
    const [, row] = csv.split('\n');
    expect(row.endsWith('-50.00')).toBe(true);
  });
});
