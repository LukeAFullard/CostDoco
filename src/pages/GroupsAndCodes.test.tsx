import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { GroupsAndCodes } from './GroupsAndCodes';
import { AppDataProvider, useAppData } from '../context/AppDataContext';
import { closeDB, getReceipts } from '../db';

// Test-only helper: saves a receipt referencing the first known cost code through
// the same AppDataProvider the page under test uses, so context state (not just
// the underlying db) reflects the new receipt.
function SaveReceiptForFirstCode() {
  const { costCodes, saveReceipt } = useAppData();
  return (
    <button
      onClick={() => {
        const now = new Date().toISOString();
        saveReceipt({
          id: crypto.randomUUID(),
          date: '2026-08-26',
          codeId: costCodes[0].id,
          taxMode: 'header',
          lineItems: [{ id: crypto.randomUUID(), amountIncTax: 10 }],
          currency: 'USD',
          billable: false,
          pdfBlobRef: 'b1',
          pageBlobRefs: ['b1'],
          createdAt: now,
          updatedAt: now,
        });
      }}
    >
      Save Test Receipt
    </button>
  );
}

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

afterEach(() => cleanup());

const renderPage = () =>
  render(
    <AppDataProvider>
      <GroupsAndCodes />
    </AppDataProvider>
  );

describe('GroupsAndCodes', () => {
  it('creates a top-level group', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/group name/i);
    fireEvent.change(input, { target: { value: 'Client A' } });
    fireEvent.click(screen.getByText('Add Group'));
    expect(await screen.findByText('Client A')).toBeInTheDocument();
  });

  it('creates a subgroup nested under a parent group', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByPlaceholderText(/group name/i);
    fireEvent.change(input, { target: { value: 'Parent' } });
    fireEvent.click(screen.getByText('Add Group'));
    await screen.findByText('Parent');

    fireEvent.change(input, { target: { value: 'Child' } });
    await user.selectOptions(screen.getByDisplayValue('Top-level group'), 'Subgroup of Parent');
    fireEvent.click(screen.getByText('Add Group'));

    expect(await screen.findByText('Child')).toBeInTheDocument();
  });

  it('adds a cost code to a group and can rename it', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/group name/i);
    fireEvent.change(input, { target: { value: 'Client A' } });
    fireEvent.click(screen.getByText('Add Group'));
    await screen.findByText('Client A');

    const groupPanel = screen.getByText('Client A').closest('div')!.parentElement!;
    fireEvent.click(within(groupPanel).getByText('Add cost code'));
    const codeInput = within(groupPanel).getByPlaceholderText('Cost code name');
    fireEvent.change(codeInput, { target: { value: 'Materials' } });
    fireEvent.click(within(groupPanel).getByText('Add'));

    expect(await screen.findByText('Materials')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit Materials'));
    const editInput = screen.getByDisplayValue('Materials');
    fireEvent.change(editInput, { target: { value: 'Site Materials' } });
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('Site Materials')).toBeInTheDocument();
  });

  it('blocks deleting a group that still has a cost code', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderPage();
    const input = await screen.findByPlaceholderText(/group name/i);
    fireEvent.change(input, { target: { value: 'Client A' } });
    fireEvent.click(screen.getByText('Add Group'));
    await screen.findByText('Client A');

    const groupPanel = screen.getByText('Client A').closest('div')!.parentElement!;
    fireEvent.click(within(groupPanel).getByText('Add cost code'));
    fireEvent.change(within(groupPanel).getByPlaceholderText('Cost code name'), { target: { value: 'Materials' } });
    fireEvent.click(within(groupPanel).getByText('Add'));
    await screen.findByText('Materials');

    fireEvent.click(screen.getByLabelText('Delete Client A'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByText('Client A')).toBeInTheDocument();
  });

  it('adds an ungrouped cost code', async () => {
    renderPage();
    const panel = (await screen.findByText('Ungrouped Cost Codes')).closest('div')!;
    fireEvent.click(within(panel).getByText('Add cost code'));
    fireEvent.change(within(panel).getByPlaceholderText('Cost code name'), { target: { value: 'Bank Fees' } });
    fireEvent.click(within(panel).getByText('Add'));

    expect(await screen.findByText('Bank Fees')).toBeInTheDocument();
  });

  it('blocks deleting a cost code still referenced by a receipt', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <AppDataProvider>
        <SaveReceiptForFirstCode />
        <GroupsAndCodes />
      </AppDataProvider>
    );
    const panel = (await screen.findByText('Ungrouped Cost Codes')).closest('div')!;
    fireEvent.click(within(panel).getByText('Add cost code'));
    fireEvent.change(within(panel).getByPlaceholderText('Cost code name'), { target: { value: 'Bank Fees' } });
    fireEvent.click(within(panel).getByText('Add'));
    await screen.findByText('Bank Fees');

    fireEvent.click(screen.getByText('Save Test Receipt'));
    await waitFor(async () => expect(await getReceipts()).toHaveLength(1));

    fireEvent.click(screen.getByLabelText('Delete Bank Fees'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByText('Bank Fees')).toBeInTheDocument();
  });
});
