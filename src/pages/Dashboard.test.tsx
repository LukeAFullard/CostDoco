import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { Dashboard } from './Dashboard';
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
    taxMode: 'header',
    lineItems: [{ id: crypto.randomUUID(), amountExTax: 10, amountIncTax: 11 }],
    currency: 'USD',
    billable: false,
    pdfBlobRef: 'b1',
    pageBlobRefs: ['b1'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <AppDataProvider>
        <Dashboard />
      </AppDataProvider>
    </MemoryRouter>
  );

describe('Dashboard', () => {
  it('shows an empty state when there are no receipts', async () => {
    renderDashboard();
    expect(await screen.findByText(/no receipts yet/i)).toBeInTheDocument();
  });

  it('lists receipts with vendor, date, and total', async () => {
    await putReceipt(makeReceipt({ vendor: 'Acme Hardware' }));
    renderDashboard();
    expect(await screen.findByText('Acme Hardware')).toBeInTheDocument();
    expect(screen.getByText(/USD 11\.00/)).toBeInTheDocument();
  });

  it('labels a receipt with no group as Uncategorized', async () => {
    await putReceipt(makeReceipt({ vendor: 'Cafe' }));
    renderDashboard();
    expect(await screen.findByText(/Uncategorized/)).toBeInTheDocument();
  });

  it('filters the list by group', async () => {
    const group: Group = { id: crypto.randomUUID(), name: 'Client A', color: '#3E7368', parentId: null, archived: false, updatedAt: new Date().toISOString() };
    await putGroup(group);
    await putReceipt(makeReceipt({ vendor: 'In Group', groupId: group.id }));
    await putReceipt(makeReceipt({ vendor: 'No Group' }));

    renderDashboard();
    expect(await screen.findByText('In Group')).toBeInTheDocument();
    expect(await screen.findByText('No Group')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group'), { target: { value: group.id } });

    expect(await screen.findByText('In Group')).toBeInTheDocument();
    expect(screen.queryByText('No Group')).not.toBeInTheDocument();
  });
});
