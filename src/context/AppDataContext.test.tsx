import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AppDataProvider, useAppData } from './AppDataContext';
import { closeDB } from '../db';

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

describe('useAppData', () => {
  it('creates, updates, and deletes a group', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: Awaited<ReturnType<typeof result.current.createGroup>> = null!;
    await act(async () => {
      created = await result.current.createGroup('Client A', '#3E7368', null);
    });
    expect(result.current.groups).toHaveLength(1);

    await act(async () => {
      await result.current.updateGroup(created.id, { name: 'Client A Renamed' });
    });
    expect(result.current.groups[0].name).toBe('Client A Renamed');

    await act(async () => {
      const outcome = await result.current.deleteGroupById(created.id);
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.groups).toHaveLength(0);
  });

  it('blocks deleting a group that has a subgroup', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let parent: Awaited<ReturnType<typeof result.current.createGroup>> = null!;
    await act(async () => {
      parent = await result.current.createGroup('Parent', '#3E7368', null);
    });
    await act(async () => {
      await result.current.createGroup('Child', '#3E7368', parent.id);
    });

    await act(async () => {
      const outcome = await result.current.deleteGroupById(parent.id);
      expect(outcome).toEqual({ ok: false, reason: 'has-children' });
    });
  });

  it('blocks deleting a group that still has cost codes assigned', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let group: Awaited<ReturnType<typeof result.current.createGroup>> = null!;
    await act(async () => {
      group = await result.current.createGroup('Client A', '#3E7368', null);
    });
    await act(async () => {
      await result.current.createCostCode('Materials', group.id);
    });

    await act(async () => {
      const outcome = await result.current.deleteGroupById(group.id);
      expect(outcome).toEqual({ ok: false, reason: 'has-children' });
    });
  });

  it('creates and updates a cost code', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let code: Awaited<ReturnType<typeof result.current.createCostCode>> = null!;
    await act(async () => {
      code = await result.current.createCostCode('Materials', null);
    });
    expect(result.current.costCodes).toHaveLength(1);

    await act(async () => {
      await result.current.updateCostCode(code.id, { archived: true });
    });
    expect(result.current.costCodes[0].archived).toBe(true);

    await act(async () => {
      await result.current.deleteCostCodeById(code.id);
    });
    expect(result.current.costCodes).toHaveLength(0);
  });

  it('blocks deleting a cost code still referenced by a receipt', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let code: Awaited<ReturnType<typeof result.current.createCostCode>> = null!;
    await act(async () => {
      code = await result.current.createCostCode('Materials', null);
    });

    const now = new Date().toISOString();
    await act(async () => {
      await result.current.saveReceipt({
        id: crypto.randomUUID(),
        date: '2026-08-26',
        codeId: code.id,
        taxMode: 'header',
        lineItems: [{ id: crypto.randomUUID(), amountIncTax: 10 }],
        currency: 'USD',
        billable: false,
        pdfBlobRef: 'b1',
        pageBlobRefs: ['b1'],
        createdAt: now,
        updatedAt: now,
      });
    });

    await act(async () => {
      const outcome = await result.current.deleteCostCodeById(code.id);
      expect(outcome).toEqual({ ok: false, reason: 'has-children' });
    });
    expect(result.current.costCodes).toHaveLength(1);
  });

  it('saves and removes a receipt', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const now = new Date().toISOString();
    const receipt = {
      id: crypto.randomUUID(),
      date: '2026-08-26',
      taxMode: 'header' as const,
      lineItems: [{ id: crypto.randomUUID(), amountExTax: 10, amountIncTax: 11 }],
      currency: 'USD',
      billable: false,
      pdfBlobRef: 'b1',
      pageBlobRefs: ['b1'],
      createdAt: now,
      updatedAt: now,
    };

    await act(async () => {
      await result.current.saveReceipt(receipt);
    });
    expect(result.current.receipts).toHaveLength(1);

    await act(async () => {
      await result.current.removeReceipt(receipt.id);
    });
    expect(result.current.receipts).toHaveLength(0);
  });

  it('merges partial updates into settings', async () => {
    const { result } = renderHook(() => useAppData(), { wrapper: AppDataProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSettings({ homeCurrency: 'NZD' });
    });
    expect(result.current.settings?.homeCurrency).toBe('NZD');
    expect(result.current.settings?.theme).toBe('light');
  });
});
