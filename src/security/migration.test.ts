import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDB, getReceipt, getReceipts, putBlob, putReceipt, putSettings } from '../db';
import { openDB } from 'idb';
import { enableEncryption, disableEncryption, unlock, verifyPassphrase, IncorrectPassphraseError } from './migration';
import { isUnlocked, lock, setEncryptionRequired, setSessionKey } from './session';
import type { Receipt, Settings } from '../types';

// fake-indexeddb's structured clone under jsdom doesn't preserve Blob's
// prototype (see src/db/index.test.ts's "round-trips a blob" test), so a
// round-tripped blob loses .arrayBuffer() — which encryptBlob needs for real
// when migration re-encrypts an existing blob. Shadow every put blob by id
// (test blob ids are always unique) and serve reads from there, bypassing
// the corrupted round trip while still exercising the real migration.ts code.
vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db');
  const shadow = new Map<string, Parameters<typeof actual.putBlob>[0]>();
  return {
    ...actual,
    putBlob: vi.fn(async (blob: Parameters<typeof actual.putBlob>[0]) => {
      shadow.set(blob.id, blob);
      return actual.putBlob(blob);
    }),
    getBlob: vi.fn(async (id: string) => shadow.get(id) ?? actual.getBlob(id)),
  };
});

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
  setSessionKey(null);
  setEncryptionRequired(false);
});

afterEach(() => {
  setSessionKey(null);
  setEncryptionRequired(false);
});

const baseSettings: Settings = {
  id: 'app-settings',
  homeCurrency: 'USD',
  customFieldDefinitions: [],
  theme: 'light',
  lastBackupAt: null,
  backupReminderDays: 30,
  encryptionEnabled: false,
};

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
    pdfBlobRef: 'unused',
    pageBlobRefs: ['unused'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

async function rawReceiptEncryptedFlag(id: string): Promise<boolean | undefined> {
  const db = await openDB('costdoco-db', 1);
  const raw = await db.get('receipts', id);
  return raw?.encrypted;
}

describe('enableEncryption', () => {
  it('migrates existing plain receipts to ciphertext and persists the encryption settings', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    expect(await rawReceiptEncryptedFlag(receipt.id)).toBe(false);

    await enableEncryption('correct horse battery staple', baseSettings);

    expect(await rawReceiptEncryptedFlag(receipt.id)).toBe(true);
    expect(isUnlocked()).toBe(true);
    // Transparently readable now that we're unlocked with the new key.
    expect(await getReceipt(receipt.id)).toEqual(receipt);
  });

  it('reports migration progress across every receipt and blob', async () => {
    await putReceipt(makeReceipt({ pdfBlobRef: 'b1', pageBlobRefs: ['b1'] }));
    await putBlob({ id: 'b1', blob: new Blob(['x'], { type: 'application/pdf' }), mimeType: 'application/pdf', createdAt: new Date().toISOString() });

    const seen: { done: number; total: number }[] = [];
    await enableEncryption('pw', baseSettings, (p) => seen.push({ ...p }));

    expect(seen.length).toBe(2); // 1 receipt + 1 blob
    expect(seen[seen.length - 1]).toEqual({ done: 2, total: 2 });
  });

  it('leaves data readable after an interrupted migration (settings persisted before the migration loop)', async () => {
    // Two receipts exist; simulate the process dying after settings are
    // persisted but only the first receipt has been re-encrypted.
    const r1 = makeReceipt();
    const r2 = makeReceipt();
    await putReceipt(r1);
    await putReceipt(r2);

    // Manually replicate enableEncryption's first phase (persist settings +
    // unlock) without running the full migration loop, to simulate a crash
    // right after the safety-critical settings write.
    const { deriveKey, generateSaltBase64, createVerifier, DEFAULT_ITERATIONS } = await import('./crypto');
    const salt = generateSaltBase64();
    const key = await deriveKey('pw', salt, DEFAULT_ITERATIONS);
    const verifier = await createVerifier(key);
    setSessionKey(key);
    setEncryptionRequired(true);
    await putSettings({ ...baseSettings, encryptionEnabled: true, encryptionSalt: salt, encryptionIterations: DEFAULT_ITERATIONS, encryptionVerifier: verifier });
    await putReceipt(r1); // only r1 gets migrated

    expect(await rawReceiptEncryptedFlag(r1.id)).toBe(true);
    expect(await rawReceiptEncryptedFlag(r2.id)).toBe(false);

    // Both are still fully readable despite the mixed encrypted/plain state.
    const all = await getReceipts();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === r1.id)).toEqual(r1);
    expect(all.find((r) => r.id === r2.id)).toEqual(r2);
  });
});

describe('disableEncryption', () => {
  it('rejects an incorrect passphrase without touching any data', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    await enableEncryption('correct passphrase', baseSettings);

    await expect(disableEncryption('wrong passphrase', await currentSettingsFromDb())).rejects.toThrow(IncorrectPassphraseError);
    expect(await rawReceiptEncryptedFlag(receipt.id)).toBe(true);
  });

  it('migrates every receipt back to plain storage and clears the encryption settings', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);
    await enableEncryption('correct passphrase', baseSettings);
    expect(await rawReceiptEncryptedFlag(receipt.id)).toBe(true);

    await disableEncryption('correct passphrase', await currentSettingsFromDb());

    expect(await rawReceiptEncryptedFlag(receipt.id)).toBe(false);
    expect(await getReceipt(receipt.id)).toEqual(receipt);
  });

  it('leaves the session locked afterward — no passphrase needed anymore', async () => {
    await putReceipt(makeReceipt());
    await enableEncryption('pw', baseSettings);
    await disableEncryption('pw', await currentSettingsFromDb());
    // Not required anymore, so being "locked" (no session key) is fine — reads still work.
    lock();
    setEncryptionRequired(false);
    expect(await getReceipts()).toHaveLength(1);
  });
});

describe('unlock / verifyPassphrase', () => {
  it('unlocks the session on a correct passphrase', async () => {
    await enableEncryption('the real passphrase', baseSettings);
    lock();
    expect(isUnlocked()).toBe(false);

    await unlock('the real passphrase', await currentSettingsFromDb());
    expect(isUnlocked()).toBe(true);
  });

  it('throws IncorrectPassphraseError and stays locked on a wrong passphrase', async () => {
    await enableEncryption('the real passphrase', baseSettings);
    lock();

    await expect(unlock('a wrong guess', await currentSettingsFromDb())).rejects.toThrow(IncorrectPassphraseError);
    expect(isUnlocked()).toBe(false);
  });

  it('throws a clear error when encryption settings are missing or corrupt', async () => {
    await expect(verifyPassphrase('anything', baseSettings)).rejects.toThrow(/missing or corrupt/i);
  });
});

// Re-reads settings from the db the same way the app would (context reload), since
// enableEncryption persists via putSettings rather than returning the new object.
async function currentSettingsFromDb(): Promise<Settings> {
  const { getSettings } = await import('../db');
  return getSettings();
}
