import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Group, CostCode, Receipt, ReceiptBlob, Settings } from '../types';
import { encryptJson, decryptJson, encryptBlob, decryptBlob } from '../security/crypto';
import { getSessionKey, requireKeyIfNeeded, EncryptionLockedError } from '../security/session';

/**
 * Receipts and blobs are the only stores Phase 4 encrypts (per
 * docs/implementation/04-security-and-bridge.md step 4) — id/groupId/codeId/date
 * stay in the clear for indexing/sorting without a full decrypt pass. Every
 * other field lives inside one ciphertext per receipt.
 */
type SensitiveReceiptFields = Omit<Receipt, 'id' | 'groupId' | 'codeId' | 'date'>;

interface StoredReceipt {
  id: string;
  groupId?: string;
  codeId?: string;
  date: string;
  encrypted: boolean;
  iv?: string; // present when encrypted
  ciphertext?: string; // present when encrypted
  plain?: SensitiveReceiptFields; // present when not encrypted
}

interface StoredBlob {
  id: string;
  mimeType: string;
  createdAt: string;
  encrypted: boolean;
  iv?: string; // present when encrypted
  blob: Blob; // ciphertext bytes when encrypted, plain bytes otherwise
}

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
    value: StoredReceipt;
    indexes: { 'by-group': string; 'by-code': string; 'by-date': string };
  };
  blobs: {
    key: string;
    value: StoredBlob;
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
  encryptionEnabled: false,
  ocrEnabled: true,
};

let dbPromise: Promise<IDBPDatabase<CostDocoDB>> | null = null;
let isFallbackMode = false;

const fallbackMemoryDB = {
  groups: new Map<string, Group>(),
  codes: new Map<string, CostCode>(),
  receipts: new Map<string, StoredReceipt>(),
  blobs: new Map<string, StoredBlob>(),
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

// --- Encryption helpers (receipts + blobs only — see StoredReceipt/StoredBlob above) ---

async function toStoredReceipt(receipt: Receipt): Promise<StoredReceipt> {
  const { id, groupId, codeId, date, ...sensitive } = receipt;
  const key = requireKeyIfNeeded();
  if (!key) {
    return { id, groupId, codeId, date, encrypted: false, plain: sensitive };
  }
  const { iv, ciphertext } = await encryptJson(key, sensitive);
  return { id, groupId, codeId, date, encrypted: true, iv, ciphertext };
}

async function fromStoredReceipt(stored: StoredReceipt): Promise<Receipt> {
  if (!stored.encrypted) {
    return { id: stored.id, groupId: stored.groupId, codeId: stored.codeId, date: stored.date, ...stored.plain! };
  }
  const key = getSessionKey();
  if (!key) throw new EncryptionLockedError();
  const sensitive = await decryptJson<SensitiveReceiptFields>(key, { iv: stored.iv!, ciphertext: stored.ciphertext! });
  return { id: stored.id, groupId: stored.groupId, codeId: stored.codeId, date: stored.date, ...sensitive };
}

async function toStoredBlob(record: ReceiptBlob): Promise<StoredBlob> {
  const { id, blob, mimeType, createdAt } = record;
  const key = requireKeyIfNeeded();
  if (!key) {
    return { id, mimeType, createdAt, encrypted: false, blob };
  }
  const { iv, blob: ciphertextBlob } = await encryptBlob(key, blob);
  return { id, mimeType, createdAt, encrypted: true, iv, blob: ciphertextBlob };
}

async function fromStoredBlob(stored: StoredBlob): Promise<ReceiptBlob> {
  if (!stored.encrypted) {
    return { id: stored.id, blob: stored.blob, mimeType: stored.mimeType, createdAt: stored.createdAt };
  }
  const key = getSessionKey();
  if (!key) throw new EncryptionLockedError();
  const blob = await decryptBlob(key, { iv: stored.iv!, blob: stored.blob }, stored.mimeType);
  return { id: stored.id, blob, mimeType: stored.mimeType, createdAt: stored.createdAt };
}

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
// Transparently encrypted when a session key is set (see toStoredReceipt/fromStoredReceipt
// above) — callers always deal in plain `Receipt` objects, never ciphertext.

export const getReceipts = async (): Promise<Receipt[]> => {
  const stored = isFallbackMode
    ? Array.from(fallbackMemoryDB.receipts.values())
    : await (async () => {
        try {
          const db = await getDB();
          return await db.getAll('receipts');
        } catch (error) {
          triggerFallbackMode(error);
          return Array.from(fallbackMemoryDB.receipts.values());
        }
      })();
  return Promise.all(stored.map(fromStoredReceipt));
};

export const getReceipt = async (id: string): Promise<Receipt | undefined> => {
  let stored: StoredReceipt | undefined;
  if (isFallbackMode) {
    stored = fallbackMemoryDB.receipts.get(id);
  } else {
    try {
      const db = await getDB();
      stored = await db.get('receipts', id);
    } catch (error) {
      triggerFallbackMode(error);
      stored = fallbackMemoryDB.receipts.get(id);
    }
  }
  return stored ? fromStoredReceipt(stored) : undefined;
};

export const putReceipt = async (receipt: Receipt): Promise<string> => {
  const stored = await toStoredReceipt(receipt);
  if (isFallbackMode) {
    fallbackMemoryDB.receipts.set(stored.id, stored);
    return stored.id;
  }
  try {
    const db = await getDB();
    return await db.put('receipts', stored);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.receipts.set(stored.id, stored);
    return stored.id;
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
// Transparently encrypted the same way as receipts (see toStoredBlob/fromStoredBlob above).

export const putBlob = async (record: ReceiptBlob): Promise<string> => {
  const stored = await toStoredBlob(record);
  if (isFallbackMode) {
    fallbackMemoryDB.blobs.set(stored.id, stored);
    return stored.id;
  }
  try {
    const db = await getDB();
    return await db.put('blobs', stored);
  } catch (error) {
    triggerFallbackMode(error);
    fallbackMemoryDB.blobs.set(stored.id, stored);
    return stored.id;
  }
};

export const getBlob = async (id: string): Promise<ReceiptBlob | undefined> => {
  let stored: StoredBlob | undefined;
  if (isFallbackMode) {
    stored = fallbackMemoryDB.blobs.get(id);
  } else {
    try {
      const db = await getDB();
      stored = await db.get('blobs', id);
    } catch (error) {
      triggerFallbackMode(error);
      stored = fallbackMemoryDB.blobs.get(id);
    }
  }
  return stored ? fromStoredBlob(stored) : undefined;
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
