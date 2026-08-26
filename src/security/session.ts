// In-memory-only encryption session state, per docs/implementation/04-security-and-bridge.md
// step 3: "hold the derived key in memory only ... never in storage." A plain
// module-level variable satisfies "lock on tab close/reload" for free — a
// reload wipes all JS module state, there is nothing to explicitly clear.

let sessionKey: CryptoKey | null = null;

/** Mirrors settings.encryptionEnabled, kept in sync by AppDataContext on load/update. */
let encryptionRequired = false;

export function setEncryptionRequired(required: boolean): void {
  encryptionRequired = required;
}

export function isEncryptionRequired(): boolean {
  return encryptionRequired;
}

export function setSessionKey(key: CryptoKey | null): void {
  sessionKey = key;
}

export function getSessionKey(): CryptoKey | null {
  return sessionKey;
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

/** Clears the in-memory key. The receipts/blobs stores read/write nothing further until unlocked again. */
export function lock(): void {
  sessionKey = null;
}

export class EncryptionLockedError extends Error {
  constructor() {
    super('CostDoco is locked. Unlock with your passphrase before accessing receipts.');
    this.name = 'EncryptionLockedError';
  }
}

/**
 * The write-path key decision: encrypt with the session key whenever one is set,
 * otherwise write in the clear — unless encryption is required, in which case a
 * missing key is locked-out rather than a silent fallback to plaintext.
 */
export function requireKeyIfNeeded(): CryptoKey | null {
  if (sessionKey) return sessionKey;
  if (encryptionRequired) throw new EncryptionLockedError();
  return null;
}
