import { describe, it, expect } from 'vitest';
import {
  generateSaltBase64,
  deriveKey,
  encryptJson,
  decryptJson,
  encryptBlob,
  decryptBlob,
  createVerifier,
  checkVerifier,
  DEFAULT_ITERATIONS,
} from './crypto';

// Low iteration count keeps the test suite fast; correctness doesn't depend on the count.
const FAST_ITERATIONS = 100;

describe('generateSaltBase64', () => {
  it('produces different salts each call', () => {
    const a = generateSaltBase64();
    const b = generateSaltBase64();
    expect(a).not.toBe(b);
  });
});

describe('deriveKey', () => {
  it('derives the same key for the same passphrase + salt + iterations', async () => {
    const salt = generateSaltBase64();
    const keyA = await deriveKey('correct horse battery staple', salt, FAST_ITERATIONS);
    const keyB = await deriveKey('correct horse battery staple', salt, FAST_ITERATIONS);

    const payload = await encryptJson(keyA, { hello: 'world' });
    expect(await decryptJson(keyB, payload)).toEqual({ hello: 'world' });
  });

  it('derives a different key for a different passphrase', async () => {
    const salt = generateSaltBase64();
    const keyA = await deriveKey('passphrase one', salt, FAST_ITERATIONS);
    const keyB = await deriveKey('passphrase two', salt, FAST_ITERATIONS);

    const payload = await encryptJson(keyA, { hello: 'world' });
    await expect(decryptJson(keyB, payload)).rejects.toThrow();
  });

  it('derives a different key for a different salt', async () => {
    const keyA = await deriveKey('same passphrase', generateSaltBase64(), FAST_ITERATIONS);
    const keyB = await deriveKey('same passphrase', generateSaltBase64(), FAST_ITERATIONS);

    const payload = await encryptJson(keyA, { hello: 'world' });
    await expect(decryptJson(keyB, payload)).rejects.toThrow();
  });

  it('uses a sensible default iteration count when none is given', async () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(210_000);
  });
});

describe('encryptJson / decryptJson', () => {
  it('round-trips an arbitrary JSON-serializable value', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    const value = { vendor: 'Acme "Best" Co.', amounts: [1, 2.5, null], nested: { a: 1 } };
    const payload = await encryptJson(key, value);
    expect(await decryptJson(key, payload)).toEqual(value);
  });

  it('produces a different ciphertext each time (random IV), even for the same input', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    const a = await encryptJson(key, { x: 1 });
    const b = await encryptJson(key, { x: 1 });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('does not leave the plaintext visible anywhere in the ciphertext string', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    const payload = await encryptJson(key, { secret: 'CanaryToken12345' });
    expect(payload.ciphertext).not.toContain('CanaryToken12345');
  });
});

describe('encryptBlob / decryptBlob', () => {
  it('round-trips binary content and preserves the mime type on decrypt', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), FAST_ITERATIONS);
    const original = new Blob(['%PDF-1.4 fake pdf bytes'], { type: 'application/pdf' });
    const payload = await encryptBlob(key, original);
    const decrypted = await decryptBlob(key, payload, 'application/pdf');
    expect(decrypted.type).toBe('application/pdf');
    expect(await decrypted.text()).toBe('%PDF-1.4 fake pdf bytes');
  });
});

describe('createVerifier / checkVerifier', () => {
  it('confirms a correct passphrase-derived key', async () => {
    const salt = generateSaltBase64();
    const key = await deriveKey('right passphrase', salt, FAST_ITERATIONS);
    const verifier = await createVerifier(key);
    expect(await checkVerifier(key, verifier)).toBe(true);
  });

  it('rejects an incorrect passphrase-derived key without throwing', async () => {
    const salt = generateSaltBase64();
    const rightKey = await deriveKey('right passphrase', salt, FAST_ITERATIONS);
    const wrongKey = await deriveKey('wrong passphrase', salt, FAST_ITERATIONS);
    const verifier = await createVerifier(rightKey);
    expect(await checkVerifier(wrongKey, verifier)).toBe(false);
  });
});
