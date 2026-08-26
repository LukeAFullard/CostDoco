import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { ReceiptForm } from './ReceiptForm';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, getReceipt, putCostCode, putReceipt } from '../db';
import type { CostCode, Receipt } from '../types';

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

afterEach(() => cleanup());

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    date: '2026-08-20',
    taxMode: 'header',
    lineItems: [{ id: crypto.randomUUID() }],
    currency: 'USD',
    billable: false,
    pdfBlobRef: 'b1',
    pageBlobRefs: ['b1'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const renderForm = (receiptId: string) =>
  render(
    <MemoryRouter initialEntries={[`/receipts/${receiptId}`]}>
      <AppDataProvider>
        <Routes>
          <Route path="/receipts/:id" element={<ReceiptForm />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>
  );

describe('ReceiptForm', () => {
  it('shows a not-found message for an unknown receipt id', async () => {
    renderForm('missing-id');
    expect(await screen.findByText(/receipt not found/i)).toBeInTheDocument();
  });

  it('edits vendor and amount, then saves', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    renderForm(receipt.id);

    const vendorInput = await screen.findByLabelText('Vendor');
    fireEvent.change(vendorInput, { target: { value: 'Acme Hardware' } });
    fireEvent.change(screen.getByLabelText('Amount inc tax'), { target: { value: '42.50' } });

    fireEvent.click(screen.getByText('Save Receipt'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.vendor).toBe('Acme Hardware');
      expect(saved?.lineItems[0].amountIncTax).toBe(42.5);
    });
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('switching to itemized mode allows adding and removing line items', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    renderForm(receipt.id);

    await screen.findByLabelText('Vendor');
    fireEvent.click(screen.getByText('Itemized'));
    fireEvent.click(screen.getByText('Add Line'));

    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText('Remove line')[0]);
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
  });

  it('switching back to header mode collapses to a single line item', async () => {
    const receipt = makeReceipt({
      taxMode: 'itemized',
      lineItems: [
        { id: crypto.randomUUID(), description: 'Nails', amountIncTax: 5 },
        { id: crypto.randomUUID(), description: 'Screws', amountIncTax: 3 },
      ],
    });
    await putReceipt(receipt);
    renderForm(receipt.id);

    await screen.findByLabelText('Vendor');
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);

    fireEvent.click(screen.getByText('Header'));
    expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount inc tax')).toHaveValue(5);
  });

  it('adds a custom field definition and stores its value on the receipt', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    renderForm(receipt.id);

    await screen.findByLabelText('Vendor');
    fireEvent.change(screen.getByPlaceholderText(/add a field/i), { target: { value: 'Vendor Tax Number' } });
    fireEvent.click(screen.getByText('Add Field'));

    const fieldInput = await screen.findByLabelText('Vendor Tax Number');
    fireEvent.change(fieldInput, { target: { value: 'GST-123' } });
    fireEvent.click(screen.getByText('Save Receipt'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(Object.values(saved?.customFields ?? {})).toContain('GST-123');
    });
  });

  it('suggests a cost code from a past receipt with a closely-matching vendor, applied only on click', async () => {
    const code: CostCode = { id: 'code1', name: 'Travel', groupId: null, archived: false, updatedAt: new Date().toISOString() };
    await putCostCode(code);
    await putReceipt(makeReceipt({ vendor: 'Acme Taxi', codeId: 'code1' }));
    const receipt = makeReceipt();
    await putReceipt(receipt);
    renderForm(receipt.id);

    const vendorInput = await screen.findByLabelText('Vendor');
    fireEvent.change(vendorInput, { target: { value: 'Acme Taxi' } });

    expect(await screen.findByText(/used cost code/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Cost Code')).toHaveValue('');

    fireEvent.click(screen.getByText('Use this code'));
    expect(screen.getByLabelText('Cost Code')).toHaveValue('code1');
    expect(screen.queryByText(/used cost code/i)).not.toBeInTheDocument();
  });

  it('does not suggest a code once the receipt already has one', async () => {
    const code: CostCode = { id: 'code1', name: 'Travel', groupId: null, archived: false, updatedAt: new Date().toISOString() };
    await putCostCode(code);
    await putReceipt(makeReceipt({ vendor: 'Acme Taxi', codeId: 'code1' }));
    const receipt = makeReceipt({ vendor: 'Acme Taxi', codeId: 'code1' });
    await putReceipt(receipt);
    renderForm(receipt.id);

    await screen.findByLabelText('Vendor');
    expect(screen.queryByText(/used cost code/i)).not.toBeInTheDocument();
  });

  it('deletes the receipt', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    renderForm(receipt.id);

    await screen.findByLabelText('Vendor');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(async () => {
      expect(await getReceipt(receipt.id)).toBeUndefined();
    });
    confirmSpy.mockRestore();
  });
});
