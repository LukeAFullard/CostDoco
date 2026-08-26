import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAppData } from '../context/AppDataContext';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useAppData();
  const [newFieldLabel, setNewFieldLabel] = useState('');

  if (!settings) return null;

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
    </div>
  );
};
