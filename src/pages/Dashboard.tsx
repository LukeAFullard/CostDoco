import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { useAppData } from '../context/AppDataContext';
import { receiptTotalIncTax } from '../types';

const UNCATEGORIZED = '__uncategorized__';

export const Dashboard: React.FC = () => {
  const { receipts, groups, costCodes, settings } = useAppData();
  const [groupFilter, setGroupFilter] = useState<string>('');

  const groupName = (id?: string) => (id ? groups.find((g) => g.id === id)?.name ?? 'Uncategorized' : 'Uncategorized');
  const codeName = (id?: string) => (id ? costCodes.find((c) => c.id === id)?.name : undefined);

  const filtered = useMemo(() => {
    const sorted = [...receipts].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!groupFilter) return sorted;
    if (groupFilter === UNCATEGORIZED) return sorted.filter((r) => !r.groupId);
    return sorted.filter((r) => r.groupId === groupFilter);
  }, [receipts, groupFilter]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-graphite dark:text-stone">Receipts</h1>
        <Link to="/receipts/new">
          <Button variant="primary">
            <Plus size={16} className="mr-1" /> New Receipt
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="group-filter" className="text-sm text-gray-600 dark:text-gray-400">
          Group
        </label>
        <select
          id="group-filter"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="px-3 py-1.5 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone text-sm"
        >
          <option value="">All groups</option>
          <option value={UNCATEGORIZED}>Uncategorized</option>
          {groups.filter((g) => !g.archived).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-8 text-center text-gray-600 dark:text-gray-400">
          No receipts yet. Capture your first receipt to get started.
        </Panel>
      ) : (
        <div className="space-y-2">
          {filtered.map((receipt) => (
            <Link key={receipt.id} to={`/receipts/${receipt.id}`}>
              <Panel className="p-4 flex items-center justify-between gap-4 hover:bg-stone/50 dark:hover:bg-ink/40 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-graphite dark:text-stone truncate">
                    {receipt.vendor || 'Unnamed vendor'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {receipt.date} · {groupName(receipt.groupId)}
                    {codeName(receipt.codeId) ? ` · ${codeName(receipt.codeId)}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono tabular-nums font-semibold text-graphite dark:text-stone">
                    {receipt.currency} {receiptTotalIncTax(receipt).toFixed(2)}
                  </p>
                  {receipt.currency !== settings?.homeCurrency && receipt.convertedAmount != null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ≈ {settings?.homeCurrency} {receipt.convertedAmount.toFixed(2)}
                    </p>
                  )}
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
