// Web Crypto primitives for Phase 4 (encryption at rest). PBKDF2 -> AES-GCM,
// per docs/implementation/04-security-and-bridge.md step 2. No new dependency —
// everything here is the browser's native SubtleCrypto API.

const SALT_BYTES = 16;
const IV_BYTES = 12; // recommended nonce size for AES-GCM
export const DEFAULT_ITERATIONS = 210_000; // OWASP 2023 minimum recommendation for PBKDF2-SHA256

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSaltBase64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Derives a non-extractable AES-GCM key from a passphrase. Never persist the key or the passphrase. */
export async function deriveKey(passphrase: string, saltBase64: string, iterations: number = DEFAULT_ITERATIONS): Promise<CryptoKey> {
  const passphraseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(saltBase64) as BufferSource, iterations, hash: 'SHA-256' },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  iv: string; // base64
  ciphertext: string; // base64
}

export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/** Throws if `key` is wrong or the data was tampered with — AES-GCM's authentication tag check fails closed. */
export async function decryptBytes(key: CryptoKey, payload: EncryptedPayload): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource },
    key,
    fromBase64(payload.ciphertext) as BufferSource
  );
  return new Uint8Array(plaintext);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const bytes = await decryptBytes(key, payload);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export interface EncryptedBlobPayload {
  iv: string; // base64, tiny
  blob: Blob; // raw ciphertext bytes — not base64, to avoid ~33% bloat on large PDFs
}

export async function encryptBlob(key: CryptoKey, blob: Blob): Promise<EncryptedBlobPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return { iv: toBase64(iv), blob: new Blob([ciphertext], { type: 'application/octet-stream' }) };
}

export async function decryptBlob(key: CryptoKey, payload: EncryptedBlobPayload, mimeType: string): Promise<Blob> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource },
    key,
    await payload.blob.arrayBuffer()
  );
  return new Blob([plaintext], { type: mimeType });
}

const VERIFIER_PLAINTEXT = 'costdoco-passphrase-verifier-v1';

/** Encrypts a known constant so a later decrypt-and-compare can confirm a passphrase is correct. */
export async function createVerifier(key: CryptoKey): Promise<EncryptedPayload> {
  return encryptBytes(key, new TextEncoder().encode(VERIFIER_PLAINTEXT));
}

export async function checkVerifier(key: CryptoKey, payload: EncryptedPayload): Promise<boolean> {
  try {
    const bytes = await decryptBytes(key, payload);
    return new TextDecoder().decode(bytes) === VERIFIER_PLAINTEXT;
  } catch {
    // AES-GCM's tag check throws on a wrong key — that's the expected "incorrect passphrase" path.
    return false;
  }
}
