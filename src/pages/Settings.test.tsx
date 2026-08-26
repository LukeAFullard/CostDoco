import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Settings } from './Settings';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, getSettings, putReceipt } from '../db';
import type { Receipt } from '../types';

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

afterEach(() => cleanup());

const renderPage = () =>
  render(
    <AppDataProvider>
      <Settings />
    </AppDataProvider>
  );

describe('Settings', () => {
  it('updates the home currency', async () => {
    renderPage();
    const currencyInput = await screen.findByDisplayValue('USD');
    fireEvent.change(currencyInput, { target: { value: 'nzd' } });

    await waitFor(async () => {
      expect((await getSettings()).homeCurrency).toBe('NZD');
    });
  });

  it('switches theme', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Dark'));

    await waitFor(async () => {
      expect((await getSettings()).theme).toBe('dark');
    });
  });

  it('adds and removes a custom field definition', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('Field label');
    fireEvent.change(input, { target: { value: 'Vendor Tax Number' } });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText('Vendor Tax Number')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await getSettings()).customFieldDefinitions).toHaveLength(1);
    });

    fireEvent.click(screen.getByLabelText('Remove Vendor Tax Number'));
    await waitFor(() => {
      expect(screen.queryByText('Vendor Tax Number')).not.toBeInTheDocument();
    });
  });

  it('exports a zip backup and records the last-backup time', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();
    expect(await screen.findByText('Never')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Export Zip Backup'));

    await waitFor(async () => {
      expect((await getSettings()).lastBackupAt).not.toBeNull();
    });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('imports a zip backup and shows the result summary', async () => {
    const now = new Date().toISOString();
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      date: '2026-08-20',
      taxMode: 'header',
      lineItems: [{ id: crypto.randomUUID(), amountIncTax: 10 }],
      currency: 'USD',
      billable: false,
      pdfBlobRef: 'unused',
      pageBlobRefs: ['unused'],
      createdAt: now,
      updatedAt: now,
    };
    await putReceipt(receipt);
    const { buildBackupZip } = await import('../utils/backup');
    const zipBlob = await buildBackupZip();

    await closeDB();
    indexedDB = new IDBFactory();

    renderPage();
    await screen.findByText('Never');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([zipBlob], 'backup.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/imported 0 group\(s\), 0 cost code\(s\), and 1 receipt\(s\)/i)).toBeInTheDocument();
  });

  it('shows an error message for a file that is not a valid backup', async () => {
    renderPage();
    await screen.findByText('Import Zip Backup');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['not a zip'], 'bad.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(await screen.findByText(/failed to extract zip file/i)).toBeInTheDocument();
  });
});
