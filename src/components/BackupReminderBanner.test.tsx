import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { BackupReminderBanner } from './BackupReminderBanner';
import { closeDB, putReceipt, putSettings } from '../db';
import type { Receipt, Settings } from '../types';

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
  localStorage.clear();
});

afterEach(() => cleanup());

const makeReceipt = (): Receipt => {
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
  };
};

const renderBanner = () => render(<MemoryRouter><BackupReminderBanner /></MemoryRouter>);

describe('BackupReminderBanner', () => {
  it('stays hidden when there are no receipts yet', async () => {
    renderBanner();
    await waitFor(() => expect(screen.queryByText(/last backup/i)).not.toBeInTheDocument());
  });

  it('shows when receipts exist and no backup has ever been made', async () => {
    await putReceipt(makeReceipt());
    renderBanner();
    expect(await screen.findByText(/last backup/i)).toBeInTheDocument();
  });

  it('stays hidden when a recent backup exists', async () => {
    await putReceipt(makeReceipt());
    const settings: Settings = {
      id: 'app-settings',
      homeCurrency: 'USD',
      customFieldDefinitions: [],
      theme: 'light',
      lastBackupAt: new Date().toISOString(),
      backupReminderDays: 30,
    };
    await putSettings(settings);
    renderBanner();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/last backup/i)).not.toBeInTheDocument();
  });

  it('shows again when the last backup is older than the reminder threshold', async () => {
    await putReceipt(makeReceipt());
    const settings: Settings = {
      id: 'app-settings',
      homeCurrency: 'USD',
      customFieldDefinitions: [],
      theme: 'light',
      lastBackupAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      backupReminderDays: 30,
    };
    await putSettings(settings);
    renderBanner();
    expect(await screen.findByText(/last backup/i)).toBeInTheDocument();
  });

  it('can be dismissed and stays hidden for the dismissal window', async () => {
    await putReceipt(makeReceipt());
    renderBanner();
    fireEvent.click(await screen.findByLabelText('Dismiss'));
    expect(screen.queryByText(/last backup/i)).not.toBeInTheDocument();
  });
});
