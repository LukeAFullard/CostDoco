import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Settings } from './Settings';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, getSettings } from '../db';

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
});
