import { getReceipts, getBlob, putReceipt, putBlob, putSettings } from '../db';
import { deriveKey, generateSaltBase64, createVerifier, checkVerifier, DEFAULT_ITERATIONS } from './crypto';
import { setSessionKey, setEncryptionRequired, lock } from './session';
import type { Settings } from '../types';

export interface MigrationProgress {
  done: number;
  total: number;
}

async function collectReceiptsAndBlobs(onProgress?: (p: MigrationProgress) => void) {
  const receipts = await getReceipts();
  const blobIds = new Set<string>();
  for (const r of receipts) {
    blobIds.add(r.pdfBlobRef);
    for (const ref of r.pageBlobRefs) blobIds.add(ref);
  }
  const blobs = (await Promise.all(Array.from(blobIds).map((id) => getBlob(id)))).filter((b) => !!b);
  return { receipts, blobs, total: receipts.length + blobs.length, report: onProgress };
}

/**
 * Turns encryption on: derives a new key from `passphrase`, persists the
 * salt/iterations/verifier (never the passphrase or key) *before* migrating
 * so an interrupted migration (crash, closed tab) still prompts to unlock on
 * next load rather than silently leaving data half-migrated with no way back
 * in — every receipts/blobs record self-describes whether it's encrypted, so
 * a mix of migrated/not-yet-migrated records reads back correctly either way.
 */
export async function enableEncryption(
  passphrase: string,
  currentSettings: Settings,
  onProgress?: (p: MigrationProgress) => void
): Promise<void> {
  // Read everything while still plain, before flipping any encryption state.
  const { receipts, blobs, total } = await collectReceiptsAndBlobs();

  const salt = generateSaltBase64();
  const iterations = DEFAULT_ITERATIONS;
  const key = await deriveKey(passphrase, salt, iterations);
  const verifier = await createVerifier(key);

  setSessionKey(key);
  setEncryptionRequired(true);

  await putSettings({
    ...currentSettings,
    encryptionEnabled: true,
    encryptionSalt: salt,
    encryptionIterations: iterations,
    encryptionVerifier: verifier,
  });

  let done = 0;
  for (const receipt of receipts) {
    await putReceipt(receipt);
    onProgress?.({ done: ++done, total });
  }
  for (const blob of blobs) {
    await putBlob(blob!);
    onProgress?.({ done: ++done, total });
  }
}

export class IncorrectPassphraseError extends Error {
  constructor() {
    super('Incorrect passphrase.');
    this.name = 'IncorrectPassphraseError';
  }
}

/** Derives the key for the currently-configured encryption settings and verifies it against the stored verifier. */
export async function verifyPassphrase(passphrase: string, settings: Settings): Promise<CryptoKey> {
  if (!settings.encryptionSalt || settings.encryptionIterations == null || !settings.encryptionVerifier) {
    throw new Error('Encryption settings are missing or corrupt.');
  }
  const key = await deriveKey(passphrase, settings.encryptionSalt, settings.encryptionIterations);
  const ok = await checkVerifier(key, settings.encryptionVerifier);
  if (!ok) throw new IncorrectPassphraseError();
  return key;
}

/**
 * Turns encryption off: re-confirms the passphrase against the stored
 * verifier, decrypts everything, then writes it back plain. Settings are
 * persisted as "disabled" only *after* every record has been rewritten —
 * the opposite order from enable, for the same interruption-safety reason:
 * as long as settings.encryptionEnabled still reads true on disk, an
 * interrupted disable still prompts for the (still-valid) original
 * passphrase on next load rather than stranding any not-yet-migrated
 * ciphertext with no way to unlock it.
 */
export async function disableEncryption(
  passphrase: string,
  currentSettings: Settings,
  onProgress?: (p: MigrationProgress) => void
): Promise<void> {
  const key = await verifyPassphrase(passphrase, currentSettings);
  setSessionKey(key);

  const { receipts, blobs, total } = await collectReceiptsAndBlobs();

  // From here, writes should land plain: bypass the "locked but required"
  // write guard in-memory only — settings on disk still say enabled until
  // the loop below finishes, so an interruption is still safely recoverable.
  setEncryptionRequired(false);
  lock();

  let done = 0;
  for (const receipt of receipts) {
    await putReceipt(receipt);
    onProgress?.({ done: ++done, total });
  }
  for (const blob of blobs) {
    await putBlob(blob!);
    onProgress?.({ done: ++done, total });
  }

  await putSettings({
    ...currentSettings,
    encryptionEnabled: false,
    encryptionSalt: undefined,
    encryptionIterations: undefined,
    encryptionVerifier: undefined,
  });
}

/** Unlocks the current session: verifies the passphrase and, if correct, sets the in-memory key. */
export async function unlock(passphrase: string, settings: Settings): Promise<void> {
  const key = await verifyPassphrase(passphrase, settings);
  setSessionKey(key);
}
