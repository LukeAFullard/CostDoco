# Phase 4 — Security

**Goal:** protect receipt data at rest.

**Depends on:** Phase 1 (data model).

**Note:** this phase originally also covered a Doco Suite Bridge export mechanism. Per `06-open-questions-resolved.md` §6, same-domain hosting is confirmed but the Bridge itself is deliberately deferred — it's now Phase 7, unscoped until Phases 0–6 are stable in production. Nothing below assumes or depends on the Bridge.

## Steps

1. **Resolve the forgotten-passphrase question (`06-open-questions-resolved.md` §5)**
   - Confirmed: no recovery path. A recovery mechanism (security questions, recovery codes, etc.) either weakens the encryption or requires storing something recoverable — both work against the zero-server model.
   - The enable-encryption flow must require the user to **type a short confirmation phrase** (e.g. "I understand this cannot be recovered") before encryption turns on — a checkbox is too easy to dismiss without reading. This is a hard requirement, not a nice-to-have.

2. **Key derivation**
   - Use the Web Crypto API: `PBKDF2` (passphrase + random salt, reasonable iteration count) to derive an `AES-GCM` key. No new dependency needed.
   - Persist only the salt and KDF parameters in the `settings` store — never the passphrase or derived key.

3. **Session unlock**
   - Prompt for the passphrase once per app session; hold the derived key in memory only (module-level variable or React context), never in storage.
   - Lock the app (clear the in-memory key, show the unlock prompt) on tab close/reload; consider an optional idle-timeout lock.

4. **Encrypt/decrypt wrapper**
   - Wrap reads/writes to the `receipts` store: encrypt sensitive fields (vendor, note, amounts, receipt number, custom fields) and the PDF blob before writing; decrypt on read.
   - Keep `id`, `groupId`, `codeId`, `date` unencrypted for indexing/sorting without a full decrypt pass — confirm this tradeoff is acceptable (metadata about *when* and *which project* isn't hidden, only the financial detail and document itself).

5. **Enable/disable + migration**
   - Encryption is opt-in via a settings toggle, off by default — avoids forcing passphrase friction on everyone.
   - Turning it on: confirmation phrase (step 1) → passphrase set → re-write all existing `receipts` records through the encrypt wrapper (one-time migration pass; show progress for large datasets).
   - Turning it off: reverse migration, decrypt everything back to plain storage, after re-confirming the passphrase.

6. **Backup interaction**
   - Zip export (Phase 3) exports the data as currently stored — if encryption is on, the exported PDFs/manifest stay encrypted (ciphertext + salt/KDF params, never the passphrase).
   - Restoring an encrypted backup requires the original passphrase; state this clearly in the export/restore UI so it isn't a surprise on a new device.

## Definition of Done
- Encryption can be turned on/off, requires typed confirmation (not a checkbox) on enable, and migrates existing data correctly in either direction.
- Zip backup/restore correctly round-trips encrypted data, with the passphrase requirement stated clearly at both export and restore.
