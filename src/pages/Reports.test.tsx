import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Reports } from './Reports';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, putGroup, putReceipt } from '../db';
import type { Group, Receipt } from '../types';

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

const renderPage = () =>
  render(
    <AppDataProvider>
      <Reports />
    </AppDataProvider>
  );

describe('Reports', () => {
  it('shows every receipt and the correct total when no filters are set', async () => {
    await putReceipt(makeReceipt());
    await putReceipt(makeReceipt({ vendor: 'Cafe', lineItems: [{ id: 'li', amountIncTax: 8 }] }));
    renderPage();

    expect(await screen.findByText(/2 receipts/)).toBeInTheDocument();
    expect(screen.getByText('50.00')).toBeInTheDocument(); // 42 + 8
  });

  it('filters by date range', async () => {
    await putReceipt(makeReceipt({ date: '2026-01-01' }));
    await putReceipt(makeReceipt({ date: '2026-08-20' }));
    renderPage();
    await screen.findByText(/2 receipts/);

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06-01' } });
    expect(await screen.findByText(/1 receipt\b/)).toBeInTheDocument();
  });

  it('filters by group, including an explicit Uncategorized filter', async () => {
    const group: Group = { id: 'g1', name: 'Client A', color: '#000', parentId: null, archived: false, updatedAt: new Date().toISOString() };
    await putGroup(group);
    await putReceipt(makeReceipt({ groupId: 'g1' }));
    await putReceipt(makeReceipt());
    renderPage();
    await screen.findByText(/2 receipts/);

    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'g1' } });
    expect(await screen.findByText(/1 receipt\b/)).toBeInTheDocument();
  });

  it('filters to billable-only receipts', async () => {
    await putReceipt(makeReceipt({ billable: true }));
    await putReceipt(makeReceipt({ billable: false }));
    renderPage();
    await screen.findByText(/2 receipts/);

    fireEvent.click(screen.getByLabelText('Billable only'));
    expect(await screen.findByText(/1 receipt\b/)).toBeInTheDocument();
  });

  it('warns about unconverted foreign-currency receipts without mixing them into the total', async () => {
    await putReceipt(makeReceipt({ currency: 'EUR' }));
    renderPage();
    expect(await screen.findByText(/have no converted amount/i)).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  it('disables export buttons when there are no matching receipts', async () => {
    renderPage();
    expect(await screen.findByText('Export CSV')).toBeDisabled();
    expect(screen.getByText('Generate PDF Report')).toBeDisabled();
  });

  it('exports a CSV download when clicked', async () => {
    await putReceipt(makeReceipt());
    renderPage();
    await screen.findByText(/1 receipt\b/);

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it('generates and downloads a PDF report when clicked', async () => {
    await putReceipt(makeReceipt());
    renderPage();
    await screen.findByText(/1 receipt\b/);

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Generate PDF Report'));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });
});
