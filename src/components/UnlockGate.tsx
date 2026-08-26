import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAppData } from '../context/AppDataContext';
import { unlock, IncorrectPassphraseError } from '../security/migration';

/** Full-screen passphrase prompt shown whenever encryption is enabled and the session is locked. */
export const UnlockGate: React.FC = () => {
  const { settings, refresh } = useAppData();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setUnlocking(true);
    setError(null);
    try {
      await unlock(passphrase, settings);
      await refresh();
    } catch (err) {
      setError(err instanceof IncorrectPassphraseError ? 'Incorrect passphrase.' : 'Could not unlock. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone dark:bg-ink p-4">
      <Panel className="p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 text-graphite dark:text-stone">
          <Lock size={20} />
          <h1 className="text-lg font-bold">
            Cost<span className="text-signal">Doco</span> is Locked
          </h1>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter your passphrase to unlock your receipts for this session.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            aria-label="Passphrase"
          />
          {error && <p className="text-sm text-rust">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={!passphrase || unlocking}>
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </Panel>
    </div>
  );
};
