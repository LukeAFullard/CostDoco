import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { closeDB, getReceipt, getReceipts, putReceipt, putBlob, getBlob } from './index';
import { deriveKey, generateSaltBase64 } from '../security/crypto';
import { setSessionKey, setEncryptionRequired, lock } from '../security/session';
import type { Receipt } from '../types';

const FAST_ITERATIONS = 100;

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

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    groupId: 'g1',
    codeId: 'c1',
    date: '2026-08-20',
    vendor: 'Acme Hardware',
    note: 'sensitive note',
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

/** Reads the raw stored record directly from the underlying idb store, bypassing db/index.ts's decrypt wrapper. */
async function readRawReceiptRecord(id: string): Promise<Record<string, unknown> | undefined> {
  const raw = await openDB('costdoco-db', 1);
  return raw.get('receipts', id);
}

describe('receipts encryption', () => {
  it('stores a receipt in the clear when no session key is set', async () => {
    const receipt = makeReceipt();
    await putReceipt(receipt);

    const raw = await readRawReceiptRecord(receipt.id);
    expect(raw?.encrypted).toBe(false);
    expect((raw?.plain as { vendor?: string })?.vendor).toBe('Acme Hardware');

    expect(await getReceipt(receipt.id)).toEqual(receipt);
  });

  it('stores a receipt as ciphertext when a session key is set, and round-trips it back to the plain Receipt', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    setSessionKey(key);

    const receipt = makeReceipt();
    await putReceipt(receipt);

    const raw = await readRawReceiptRecord(receipt.id);
    expect(raw?.encrypted).toBe(true);
    expect(raw?.plain).toBeUndefined();
    expect(JSON.stringify(raw)).not.toContain('Acme Hardware');
    expect(JSON.stringify(raw)).not.toContain('sensitive note');

    // id/groupId/codeId/date stay in the clear for indexing.
    expect(raw?.id).toBe(receipt.id);
    expect(raw?.groupId).toBe('g1');
    expect(raw?.codeId).toBe('c1');
    expect(raw?.date).toBe('2026-08-20');

    expect(await getReceipt(receipt.id)).toEqual(receipt);
    expect(await getReceipts()).toEqual([receipt]);
  });

  it('throws when reading an encrypted receipt while locked', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    setSessionKey(key);
    const receipt = makeReceipt();
    await putReceipt(receipt);

    lock();
    await expect(getReceipt(receipt.id)).rejects.toThrow(/locked/i);
    await expect(getReceipts()).rejects.toThrow(/locked/i);
  });

  it('throws on write when encryption is required by settings but the session is locked', async () => {
    setEncryptionRequired(true);
    await expect(putReceipt(makeReceipt())).rejects.toThrow(/locked/i);
  });

  it('cannot be decrypted with the wrong passphrase', async () => {
    const salt = generateSaltBase64();
    const rightKey = await deriveKey('right passphrase', salt, FAST_ITERATIONS);
    setSessionKey(rightKey);
    const receipt = makeReceipt();
    await putReceipt(receipt);

    const wrongKey = await deriveKey('wrong passphrase', salt, FAST_ITERATIONS);
    setSessionKey(wrongKey);
    await expect(getReceipt(receipt.id)).rejects.toThrow();
  });
});

describe('blobs encryption', () => {
  it('marks a stored blob as encrypted, with an iv, and never stores it plain', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    setSessionKey(key);

    const original = new Blob(['%PDF-1.4 sensitive receipt bytes'], { type: 'application/pdf' });
    await putBlob({ id: 'b1', blob: original, mimeType: 'application/pdf', createdAt: new Date().toISOString() });

    // fake-indexeddb's structured clone under jsdom doesn't preserve a stored
    // Blob's prototype (see src/db/index.test.ts's "round-trips a blob" test) —
    // it comes back missing .arrayBuffer(), which breaks decryptBlob() on the
    // *read* path here even though real IndexedDB preserves Blobs correctly.
    // So this test only checks the record's own encrypted/iv metadata; the
    // actual encrypt/decrypt correctness on a real Blob is already covered at
    // the primitive level in crypto.test.ts's "encryptBlob / decryptBlob" test.
    const raw = await (await openDB('costdoco-db', 1)).get('blobs', 'b1');
    expect(raw?.encrypted).toBe(true);
    expect(typeof raw?.iv).toBe('string');
    expect((raw?.iv ?? '').length).toBeGreaterThan(0);
  });

  it('throws when reading an encrypted blob while locked', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    setSessionKey(key);
    await putBlob({ id: 'b1', blob: new Blob(['x']), mimeType: 'application/pdf', createdAt: new Date().toISOString() });

    lock();
    await expect(getBlob('b1')).rejects.toThrow(/locked/i);
  });
});
