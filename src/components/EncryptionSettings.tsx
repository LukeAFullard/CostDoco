import React, { useState } from 'react';
import { Lock, Unlock, ShieldCheck } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { useAppData } from '../context/AppDataContext';
import { enableEncryption, disableEncryption, type MigrationProgress } from '../security/migration';
import { IncorrectPassphraseError } from '../security/migration';
import { isUnlocked, lock as lockSession } from '../security/session';

const CONFIRMATION_PHRASE = 'I understand this cannot be recovered';

export const EncryptionSettings: React.FC = () => {
  const { settings, refresh } = useAppData();
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [disablePassphrase, setDisablePassphrase] = useState('');
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings) return null;

  const resetEnableForm = () => {
    setConfirmationInput('');
    setPassphrase('');
    setConfirmPassphrase('');
    setError(null);
    setProgress(null);
  };

  const resetDisableForm = () => {
    setDisablePassphrase('');
    setError(null);
    setProgress(null);
  };

  const canEnable =
    confirmationInput === CONFIRMATION_PHRASE && passphrase.length > 0 && passphrase === confirmPassphrase;

  const handleEnable = async () => {
    if (!canEnable) return;
    setBusy(true);
    setError(null);
    try {
      await enableEncryption(passphrase, settings, setProgress);
      await refresh();
      setShowEnableModal(false);
      resetEnableForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable encryption.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await disableEncryption(disablePassphrase, settings, setProgress);
      await refresh();
      setShowDisableModal(false);
      resetDisableForm();
    } catch (err) {
      setError(err instanceof IncorrectPassphraseError ? 'Incorrect passphrase.' : 'Could not disable encryption.');
    } finally {
      setBusy(false);
    }
  };

  const handleLockNow = async () => {
    lockSession();
    await refresh();
  };

  const closeEnableModal = () => {
    if (busy) return;
    setShowEnableModal(false);
    resetEnableForm();
  };

  const closeDisableModal = () => {
    if (busy) return;
    setShowDisableModal(false);
    resetDisableForm();
  };

  return (
    <Panel className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-graphite dark:text-stone flex items-center gap-2">
        <ShieldCheck size={16} /> Encryption
      </h2>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Optionally encrypt receipt details and documents at rest with a passphrase. Vendor, amounts, notes, custom
        fields, and the receipt PDF are protected; the date and which group/code a receipt belongs to stay visible
        for sorting.
      </p>

      {settings.encryptionEnabled ? (
        <>
          <p className="text-sm text-verdigris-dim dark:text-verdigris flex items-center gap-1">
            <Lock size={14} /> Encryption is enabled.
          </p>
          <div className="flex flex-wrap gap-2">
            {isUnlocked() && (
              <Button variant="secondary" size="sm" onClick={handleLockNow}>
                <Lock size={14} className="mr-1" /> Lock Now
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setShowDisableModal(true)}>
              <Unlock size={14} className="mr-1" /> Disable Encryption
            </Button>
          </div>
        </>
      ) : (
        <Button variant="primary" size="sm" onClick={() => setShowEnableModal(true)}>
          <Lock size={14} className="mr-1" /> Enable Encryption
        </Button>
      )}

      {showEnableModal && (
        <Modal onClose={closeEnableModal}>
          <div className="bg-white dark:bg-graphite rounded-panel shadow-xl w-full max-w-md p-5 space-y-4 border border-graphite/20 dark:border-white/20">
            <h3 className="text-lg font-semibold text-graphite dark:text-stone">Enable Encryption</h3>
            <p className="text-sm text-rust font-medium">
              There is no way to recover your data if you forget this passphrase. It is never sent anywhere and
              cannot be reset.
            </p>
            <div>
              <label htmlFor="confirm-phrase" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
                Type "{CONFIRMATION_PHRASE}" to continue
              </label>
              <Input
                id="confirm-phrase"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="new-passphrase" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
                Passphrase
              </label>
              <Input
                id="new-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="confirm-passphrase" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
                Confirm Passphrase
              </label>
              <Input
                id="confirm-passphrase"
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                disabled={busy}
              />
            </div>
            {progress && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Encrypting existing receipts… {progress.done} / {progress.total}
              </p>
            )}
            {error && <p className="text-sm text-rust">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={closeEnableModal}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!canEnable || busy} onClick={handleEnable}>
                {busy ? 'Enabling…' : 'Enable Encryption'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showDisableModal && (
        <Modal onClose={closeDisableModal}>
          <div className="bg-white dark:bg-graphite rounded-panel shadow-xl w-full max-w-md p-5 space-y-4 border border-graphite/20 dark:border-white/20">
            <h3 className="text-lg font-semibold text-graphite dark:text-stone">Disable Encryption</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter your passphrase to confirm. Every receipt and document will be re-written in plain storage.
            </p>
            <Input
              type="password"
              placeholder="Passphrase"
              value={disablePassphrase}
              onChange={(e) => setDisablePassphrase(e.target.value)}
              disabled={busy}
              aria-label="Passphrase"
            />
            {progress && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Decrypting receipts… {progress.done} / {progress.total}
              </p>
            )}
            {error && <p className="text-sm text-rust">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={closeDisableModal}>
                Cancel
              </Button>
              <Button variant="danger" disabled={!disablePassphrase || busy} onClick={handleDisable}>
                {busy ? 'Disabling…' : 'Disable Encryption'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
};
