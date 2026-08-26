import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  closeDB,
  deleteGroup,
  getCostCodes,
  getGroups,
  getReceipt,
  getReceipts,
  getSettings,
  putBlob,
  getBlob,
  deleteBlob,
  putCostCode,
  putGroup,
  putReceipt,
  putSettings,
} from './index';
import type { CostCode, Group, Receipt, Settings } from '../types';

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: crypto.randomUUID(),
  name: 'Client A',
  color: '#3E7368',
  parentId: null,
  archived: false,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: crypto.randomUUID(),
  date: '2026-08-26',
  taxMode: 'header',
  lineItems: [{ id: crypto.randomUUID(), amountExTax: 10, amountIncTax: 11 }],
  currency: 'USD',
  billable: false,
  pdfBlobRef: 'blob-1',
  pageBlobRefs: ['blob-1'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('db', () => {
  beforeEach(async () => {
    await closeDB();
    indexedDB = new IDBFactory();
  });

  it('round-trips a group through put/getAll', async () => {
    const group = makeGroup();
    await putGroup(group);
    const groups = await getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(group);
  });

  it('deletes a group', async () => {
    const group = makeGroup();
    await putGroup(group);
    await deleteGroup(group.id);
    expect(await getGroups()).toHaveLength(0);
  });

  it('round-trips a cost code', async () => {
    const code: CostCode = { id: crypto.randomUUID(), name: 'Materials', groupId: null, archived: false, updatedAt: new Date().toISOString() };
    await putCostCode(code);
    const codes = await getCostCodes();
    expect(codes).toEqual([code]);
  });

  it('round-trips a receipt and can fetch it by id', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    expect(await getReceipts()).toEqual([receipt]);
    expect(await getReceipt(receipt.id)).toEqual(receipt);
  });

  it('round-trips a blob', async () => {
    const blob = new Blob(['hello'], { type: 'image/jpeg' });
    await putBlob({ id: 'blob-1', blob, mimeType: 'image/jpeg', createdAt: new Date().toISOString() });
    const stored = await getBlob('blob-1');
    expect(stored?.mimeType).toBe('image/jpeg');
    expect(stored?.blob).toBeTruthy();

    await deleteBlob('blob-1');
    expect(await getBlob('blob-1')).toBeUndefined();
  });

  it('returns default settings when none have been saved', async () => {
    const settings = await getSettings();
    expect(settings.id).toBe('app-settings');
    expect(settings.homeCurrency).toBe('USD');
    expect(settings.customFieldDefinitions).toEqual([]);
  });

  it('round-trips settings', async () => {
    const settings: Settings = {
      id: 'app-settings',
      homeCurrency: 'NZD',
      customFieldDefinitions: [{ id: 'f1', label: 'Vendor Tax Number' }],
      theme: 'dark',
      lastBackupAt: null,
      backupReminderDays: 30,
      encryptionEnabled: false,
    };
    await putSettings(settings);
    expect(await getSettings()).toEqual(settings);
  });
});
