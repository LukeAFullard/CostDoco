import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAppData } from '../context/AppDataContext';
import { buildBackupZip, importBackupZip, type ImportResult } from '../utils/backup';
import { downloadBlob } from '../utils/download';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useAppData();
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setStorageEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  if (!settings) return null;

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const blob = await buildBackupZip();
      downloadBlob(blob, `costdoco-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      await updateSettings({ lastBackupAt: new Date().toISOString() });
    } finally {
      setBackingUp(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await importBackupZip(file);
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addField = async () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    if (settings.customFieldDefinitions.some((d) => d.label.toLowerCase() === label.toLowerCase())) {
      setNewFieldLabel('');
      return;
    }
    await updateSettings({
      customFieldDefinitions: [...settings.customFieldDefinitions, { id: crypto.randomUUID(), label }],
    });
    setNewFieldLabel('');
  };

  const removeField = async (id: string) => {
    await updateSettings({ customFieldDefinitions: settings.customFieldDefinitions.filter((d) => d.id !== id) });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-graphite dark:text-stone">Settings</h1>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Reporting Currency</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Receipts in a different currency keep their original amount; you can optionally enter a converted amount in
          this currency for reporting.
        </p>
        <Input
          value={settings.homeCurrency}
          onChange={(e) => updateSettings({ homeCurrency: e.target.value.toUpperCase() })}
          maxLength={8}
          className="max-w-[10rem]"
        />
      </Panel>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Theme</h2>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <Button
              key={theme}
              variant={settings.theme === theme ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => updateSettings({ theme })}
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Custom Fields</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Extra fields (e.g. Vendor Tax Number) available on every receipt.
        </p>
        <div className="space-y-1">
          {settings.customFieldDefinitions.map((def) => (
            <div key={def.id} className="flex items-center justify-between text-sm">
              <span className="text-graphite dark:text-stone">{def.label}</span>
              <button aria-label={`Remove ${def.label}`} onClick={() => removeField(def.id)} className="p-1 text-gray-500 hover:text-rust">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Field label" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} />
          <Button variant="secondary" onClick={addField} disabled={!newFieldLabel.trim()}>
            Add
          </Button>
        </div>
      </Panel>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Backup</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          A full-fidelity zip backup of every group, cost code, receipt, and receipt document — restorable on a clean
          install. Distinct from the CSV/PDF exports on the Reports page, which are lossy summaries.
        </p>
        <p className="text-sm text-graphite dark:text-stone">
          Last backup: <span>{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'Never'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={handleBackup} disabled={backingUp}>
            {backingUp ? 'Exporting…' : 'Export Zip Backup'}
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Importing…' : 'Import Zip Backup'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={handleImportFile} />
        </div>
        {importResult && (
          <p className="text-sm text-verdigris-dim dark:text-verdigris">
            Imported {importResult.groupsImported} group(s), {importResult.costCodesImported} cost code(s), and{' '}
            {importResult.receiptsImported} receipt(s).
            {importResult.receiptsSkippedAsDuplicate > 0 &&
              ` Skipped ${importResult.receiptsSkippedAsDuplicate} likely duplicate receipt(s).`}
          </p>
        )}
        {importError && <p className="text-sm text-rust">{importError}</p>}
      </Panel>

      <Panel className="p-4 space-y-2">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Storage</h2>
        {storageEstimate && storageEstimate.quota > 0 ? (
          <>
            <p className="text-sm text-graphite dark:text-stone">
              Using {(storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB of{' '}
              {(storageEstimate.quota / (1024 * 1024)).toFixed(0)} MB available
            </p>
            <div className="w-full h-2 bg-stone dark:bg-ink rounded-full overflow-hidden">
              <div
                className="h-full bg-verdigris"
                style={{ width: `${Math.min(100, (storageEstimate.usage / storageEstimate.quota) * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Storage usage is not available in this browser.</p>
        )}
        {persisted != null && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Persistent storage: {persisted ? 'granted' : 'not granted — the browser may evict data under storage pressure'}
          </p>
        )}
      </Panel>
    </div>
  );
};
