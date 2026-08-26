import React, { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAppData } from '../context/AppDataContext';
import { buildReceiptsCsv } from '../utils/csv';
import { generateReceiptsReportPdf } from '../utils/pdfReport';
import { computeReportTotals } from '../utils/reportTotals';
import { downloadBlob } from '../utils/download';
import { receiptTotalIncTax } from '../types';

const UNCATEGORIZED = '__uncategorized__';

export const Reports: React.FC = () => {
  const { receipts, groups, costCodes, settings } = useAppData();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [billableOnly, setBillableOnly] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (groupFilter === UNCATEGORIZED && r.groupId) return false;
      if (groupFilter && groupFilter !== UNCATEGORIZED && r.groupId !== groupFilter) return false;
      if (codeFilter && r.codeId !== codeFilter) return false;
      if (billableOnly && !r.billable) return false;
      return true;
    });
  }, [receipts, startDate, endDate, groupFilter, codeFilter, billableOnly]);

  const totals = useMemo(() => computeReportTotals(filtered, settings?.homeCurrency ?? 'USD'), [filtered, settings?.homeCurrency]);

  const scopeLabel = groupFilter && groupFilter !== UNCATEGORIZED ? groups.find((g) => g.id === groupFilter)?.name : undefined;
  const dateRangeLabel = startDate || endDate ? `${startDate || 'earliest'} – ${endDate || 'latest'}` : undefined;

  const handleExportCsv = () => {
    const csv = buildReceiptsCsv(filtered, groups, costCodes, settings?.customFieldDefinitions ?? []);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `costdoco-receipts-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await generateReceiptsReportPdf({
        receipts: filtered,
        groups,
        costCodes,
        homeCurrency: settings?.homeCurrency ?? 'USD',
        scopeLabel,
        dateRangeLabel,
      });
      downloadBlob(blob, `costdoco-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-graphite dark:text-stone">Reports</h1>

      <Panel className="p-4 space-y-4">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Filters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="report-start" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              From
            </label>
            <Input id="report-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="report-end" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              To
            </label>
            <Input id="report-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="report-group" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Group
            </label>
            <select
              id="report-group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="w-full px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone"
            >
              <option value="">All groups</option>
              <option value={UNCATEGORIZED}>Uncategorized</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-code" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Cost Code
            </label>
            <select
              id="report-code"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone"
            >
              <option value="">All codes</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-graphite dark:text-stone">
          <input type="checkbox" checked={billableOnly} onChange={(e) => setBillableOnly(e.target.checked)} />
          Billable only
        </label>
      </Panel>

      <Panel className="p-4 space-y-2">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Summary</h2>
        <p className="text-sm text-graphite dark:text-stone">
          {filtered.length} {filtered.length === 1 ? 'receipt' : 'receipts'} · Total ({settings?.homeCurrency ?? 'USD'}):{' '}
          <span className="font-mono tabular-nums font-semibold">{totals.convertedTotal.toFixed(2)}</span>
        </p>
        {totals.unconverted.length > 0 && (
          <p className="text-xs text-signal-dim dark:text-signal">
            {totals.unconverted.length} receipt(s) in a foreign currency have no converted amount and are excluded from
            the total above.
          </p>
        )}
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleExportCsv} disabled={filtered.length === 0}>
          <Download size={16} className="mr-1" /> Export CSV
        </Button>
        <Button variant="primary" onClick={handleGeneratePdf} disabled={filtered.length === 0 || generatingPdf}>
          <FileText size={16} className="mr-1" /> {generatingPdf ? 'Generating…' : 'Generate PDF Report'}
        </Button>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No receipts match the current filters.</p>
      )}

      <div className="space-y-1">
        {filtered.slice(0, 20).map((r) => (
          <Panel key={r.id} className="p-3 flex items-center justify-between text-sm">
            <span className="text-graphite dark:text-stone">
              {r.date} · {r.vendor || 'Unnamed vendor'}
            </span>
            <span className="font-mono tabular-nums text-graphite dark:text-stone">
              {r.currency} {receiptTotalIncTax(r).toFixed(2)}
            </span>
          </Panel>
        ))}
        {filtered.length > 20 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
            + {filtered.length - 20} more — see the full export for the complete list.
          </p>
        )}
      </div>
    </div>
  );
};
