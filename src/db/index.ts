import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Group, CostCode, Receipt, ReceiptBlob, Settings } from '../types';

interface CostDocoDB extends DBSchema {
  groups: {
    key: string;
    value: Group;
    indexes: { 'by-parent': string };
  };
  codes: {
    key: string;
    value: CostCode;
    indexes: { 'by-group': string };
  };
  receipts: {
    key: string;
    value: Receipt;
    indexes: { 'by-group': string; 'by-code': string; 'by-date': string };
  };
  blobs: {
    key: string;
    value: ReceiptBlob;
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const DB_NAME = 'costdoco-db';
const DB_VERSION = 1;

const DEFAULT_SETTINGS: Settings = {
  id: 'app-settings',
  homeCurrency: 'USD',
  customFieldDefinitions: [],
  theme: 'light',
  lastBackupAt: null,
  backupReminderDays: 30,
};

let dbPromise: Promise<IDBPDatabase<CostDocoDB>> | null = null;
let isFallbackMode = false;

const fallbackMemoryDB = {
  groups: new Map<string, Group>(),
  codes: new Map<string, CostCode>(),
  receipts: new Map<string, Receipt>(),
  blobs: new Map<string, ReceiptBlob>(),
  settings: new Map<string, Settings>(),
};

const triggerFallbackMode = (error: unknown) => {
  if (!isFallbackMode) {
    console.error('IndexedDB failed, entering in-memory fallback mode:', error);
    isFallbackMode = true;
    window.dispatchEvent(new CustomEvent('idb-fallback-mode', { detail: { error } }));
  }
};

export const closeDB = async () => {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  isFallbackMode = false;
  fallbackMemoryDB.groups.clear();
  fallbackMemoryDB.codes.clear();
  fallbackMemoryDB.receipts.clear();
  fallbackMemoryDB.blobs.clear();
  fallbackMemoryDB.settings.clear();
};

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<CostDocoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('groups')) {
          const groupStore = db.createObjectStore('groups', { keyPath: 'id' });
          groupStore.createIndex('by-parent', 'parentId');
        }
        if (!db.objectStoreNames.contains('codes')) {
          const codeStore = db.createObjectStore('codes', { keyPath: 'id' });
          codeStore.createIndex('by-group', 'groupId');
        }
        if (!db.objectStoreNames.contains('receipts')) {
          const receiptStore = db.createObjectStore('receipts', { keyPath: 'id' });
          receiptStore.createIndex('by-group', 'groupId');
          receiptStore.createIndex('by-code', 'codeId');
          receiptStore.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const getDB = async () => {
  try {
    return await initDB();
  } catch (error) {
    triggerFallbackMode(error);
    throw error;
  }
};

// --- Groups ---

export const getGroups = async (): Promise<Group[]> => {
  if (isFallbackMode) return Array.from(fallbackMemoryDB.groups.values());
  try {
    const db = await getDB();
    return await db.getAll('groups');
  } catch (error) {
    triggerFallbackMode(error);
    return Array.from(fallbackMemoryDB.groups.values());
  }
};

export const putGroup = async (group: Group): Promise<string> => {
  if (isFallbackMode) {
    fallbackMemoryDB.groups.set(group.id, group);
    return group.id;
  }
  try {
    const db = await getDB();
    return await db.put('groups', group);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.groups.set(group.id, group);
    return group.id;
  }
};

export const deleteGroup = async (id: string): Promise<void> => {
  if (isFallbackMode) {
    fallbackMemoryDB.groups.delete(id);
    return;
  }
  try {
    const db = await getDB();
    return await db.delete('groups', id);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.groups.delete(id);
  }
};

// --- Cost Codes ---

export const getCostCodes = async (): Promise<CostCode[]> => {
  if (isFallbackMode) return Array.from(fallbackMemoryDB.codes.values());
  try {
    const db = await getDB();
    return await db.getAll('codes');
  } catch (error) {
    triggerFallbackMode(error);
    return Array.from(fallbackMemoryDB.codes.values());
  }
};

export const putCostCode = async (code: CostCode): Promise<string> => {
  if (isFallbackMode) {
    fallbackMemoryDB.codes.set(code.id, code);
    return code.id;
  }
  try {
    const db = await getDB();
    return await db.put('codes', code);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.codes.set(code.id, code);
    return code.id;
  }
};

export const deleteCostCode = async (id: string): Promise<void> => {
  if (isFallbackMode) {
    fallbackMemoryDB.codes.delete(id);
    return;
  }
  try {
    const db = await getDB();
    return await db.delete('codes', id);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.codes.delete(id);
  }
};

// --- Receipts ---

export const getReceipts = async (): Promise<Receipt[]> => {
  if (isFallbackMode) return Array.from(fallbackMemoryDB.receipts.values());
  try {
    const db = await getDB();
    return await db.getAll('receipts');
  } catch (error) {
    triggerFallbackMode(error);
    return Array.from(fallbackMemoryDB.receipts.values());
  }
};

export const getReceipt = async (id: string): Promise<Receipt | undefined> => {
  if (isFallbackMode) return fallbackMemoryDB.receipts.get(id);
  try {
    const db = await getDB();
    return await db.get('receipts', id);
  } catch (error) {
    triggerFallbackMode(error);
    return fallbackMemoryDB.receipts.get(id);
  }
};

export const putReceipt = async (receipt: Receipt): Promise<string> => {
  if (isFallbackMode) {
    fallbackMemoryDB.receipts.set(receipt.id, receipt);
    return receipt.id;
  }
  try {
    const db = await getDB();
    return await db.put('receipts', receipt);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.receipts.set(receipt.id, receipt);
    return receipt.id;
  }
};

export const deleteReceipt = async (id: string): Promise<void> => {
  if (isFallbackMode) {
    fallbackMemoryDB.receipts.delete(id);
    return;
  }
  try {
    const db = await getDB();
    return await db.delete('receipts', id);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.receipts.delete(id);
  }
};

// --- Blobs (captured page images / receipt documents) ---

export const putBlob = async (blob: ReceiptBlob): Promise<string> => {
  if (isFallbackMode) {
    fallbackMemoryDB.blobs.set(blob.id, blob);
    return blob.id;
  }
  try {
    const db = await getDB();
    return await db.put('blobs', blob);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.blobs.set(blob.id, blob);
    return blob.id;
  }
};

export const getBlob = async (id: string): Promise<ReceiptBlob | undefined> => {
  if (isFallbackMode) return fallbackMemoryDB.blobs.get(id);
  try {
    const db = await getDB();
    return await db.get('blobs', id);
  } catch (error) {
    triggerFallbackMode(error);
    return fallbackMemoryDB.blobs.get(id);
  }
};

export const deleteBlob = async (id: string): Promise<void> => {
  if (isFallbackMode) {
    fallbackMemoryDB.blobs.delete(id);
    return;
  }
  try {
    const db = await getDB();
    return await db.delete('blobs', id);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.blobs.delete(id);
  }
};

// --- Settings ---

export const getSettings = async (): Promise<Settings> => {
  if (isFallbackMode) return fallbackMemoryDB.settings.get('app-settings') ?? DEFAULT_SETTINGS;
  try {
    const db = await getDB();
    const existing = await db.get('settings', 'app-settings');
    return existing ?? DEFAULT_SETTINGS;
  } catch (error) {
    triggerFallbackMode(error);
    return fallbackMemoryDB.settings.get('app-settings') ?? DEFAULT_SETTINGS;
  }
};

export const putSettings = async (settings: Settings): Promise<string> => {
  if (isFallbackMode) {
    fallbackMemoryDB.settings.set(settings.id, settings);
    return settings.id;
  }
  try {
    const db = await getDB();
    return await db.put('settings', settings);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.settings.set(settings.id, settings);
    return settings.id;
  }
};
