import { describe, it, expect, beforeEach } from 'vitest';
import { deriveKey, generateSaltBase64 } from './crypto';
import {
  setEncryptionRequired,
  isEncryptionRequired,
  setSessionKey,
  getSessionKey,
  isUnlocked,
  lock,
  requireKeyIfNeeded,
  EncryptionLockedError,
} from './session';

beforeEach(() => {
  setEncryptionRequired(false);
  setSessionKey(null);
});

describe('session', () => {
  it('starts locked and not required', () => {
    expect(isUnlocked()).toBe(false);
    expect(isEncryptionRequired()).toBe(false);
  });

  it('reports unlocked once a session key is set', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), 100);
    setSessionKey(key);
    expect(isUnlocked()).toBe(true);
    expect(getSessionKey()).toBe(key);
  });

  it('lock() clears the session key', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), 100);
    setSessionKey(key);
    lock();
    expect(isUnlocked()).toBe(false);
    expect(getSessionKey()).toBeNull();
  });

  it('requireKeyIfNeeded returns null when encryption is not required', () => {
    expect(requireKeyIfNeeded()).toBeNull();
  });

  it('requireKeyIfNeeded throws when required but locked', () => {
    setEncryptionRequired(true);
    expect(() => requireKeyIfNeeded()).toThrow(EncryptionLockedError);
  });

  it('requireKeyIfNeeded returns the key when required and unlocked', async () => {
    setEncryptionRequired(true);
    const key = await deriveKey('pw', generateSaltBase64(), 100);
    setSessionKey(key);
    expect(requireKeyIfNeeded()).toBe(key);
  });

  it('requireKeyIfNeeded returns the key when set even if encryption is not marked required', async () => {
    const key = await deriveKey('pw', generateSaltBase64(), 100);
    setSessionKey(key);
    expect(requireKeyIfNeeded()).toBe(key);
  });
});
