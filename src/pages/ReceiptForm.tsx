import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAppData } from '../context/AppDataContext';
import { getBlob } from '../db';
import { findLikelyDuplicate } from '../utils/duplicateDetection';
import { suggestCodeForVendor } from '../utils/vendorMemory';
import { receiptTotalIncTax } from '../types';
import type { LineItem, Receipt, TaxMode } from '../types';

function emptyLineItem(): LineItem {
  return { id: crypto.randomUUID() };
}

export const ReceiptForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { receipts, groups, costCodes, settings, saveReceipt, removeReceipt, updateSettings } = useAppData();

  const original = useMemo(() => receipts.find((r) => r.id === id), [receipts, id]);
  const [receipt, setReceipt] = useState<Receipt | null>(original ?? null);
  const [pages, setPages] = useState<{ url: string; mimeType: string }[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');

  useEffect(() => {
    setReceipt(original ?? null);
  }, [original]);

  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;
    (async () => {
      if (!receipt) return;
      const blobs = await Promise.all(receipt.pageBlobRefs.map((ref) => getBlob(ref)));
      if (cancelled) return;
      const found = blobs.filter((b): b is NonNullable<typeof b> => !!b);
      urls = found.map((b) => URL.createObjectURL(b.blob));
      setPages(found.map((b, i) => ({ url: urls[i], mimeType: b.mimeType })));
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  // Vendor memory (PROJECT_PLAN.md §7 candidate 2) candidate list: past
  // receipts coded with a cost code that's selectable in this receipt's
  // current group. Memoized separately from the vendor-matching step below so
  // typing in the Vendor field doesn't re-filter the full receipt history on
  // every keystroke — only the (usually much smaller) candidate list is
  // re-scanned as the user types.
  const codeSuggestionCandidates = useMemo(() => {
    if (!receipt) return [];
    const allowedIds = new Set(
      costCodes.filter((c) => !c.archived && (!receipt.groupId || c.groupId === receipt.groupId || !c.groupId)).map((c) => c.id)
    );
    return receipts.filter((r) => r.id !== receipt.id && r.codeId && allowedIds.has(r.codeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, costCodes, receipt?.groupId, receipt?.id]);

  if (!receipt) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-gray-600 dark:text-gray-400">Receipt not found.</p>
      </div>
    );
  }

  const update = (updates: Partial<Receipt>) => setReceipt((prev) => (prev ? { ...prev, ...updates } : prev));

  const setTaxMode = (mode: TaxMode) => {
    if (mode === 'header') {
      update({ taxMode: 'header', lineItems: [receipt.lineItems[0] ?? emptyLineItem()] });
    } else {
      update({ taxMode: 'itemized', lineItems: receipt.lineItems.length ? receipt.lineItems : [emptyLineItem()] });
    }
  };

  const updateLineItem = (lineId: string, updates: Partial<LineItem>) => {
    update({ lineItems: receipt.lineItems.map((li) => (li.id === lineId ? { ...li, ...updates } : li)) });
  };

  const addLineItem = () => update({ lineItems: [...receipt.lineItems, emptyLineItem()] });

  const removeLineItem = (lineId: string) => {
    if (receipt.lineItems.length <= 1) return;
    update({ lineItems: receipt.lineItems.filter((li) => li.id !== lineId) });
  };

  const setCustomField = (fieldId: string, value: string) => {
    update({ customFields: { ...receipt.customFields, [fieldId]: value } });
  };

  const addCustomFieldDefinition = async () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    const definitions = settings?.customFieldDefinitions ?? [];
    if (definitions.some((d) => d.label.toLowerCase() === label.toLowerCase())) {
      setNewFieldLabel('');
      return;
    }
    const definition = { id: crypto.randomUUID(), label };
    await updateSettings({ customFieldDefinitions: [...definitions, definition] });
    setNewFieldLabel('');
  };

  const handleSave = async () => {
    await saveReceipt({ ...receipt, updatedAt: new Date().toISOString() });
    navigate('/');
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this receipt? This cannot be undone.')) return;
    await removeReceipt(receipt.id);
    navigate('/');
  };

  const availableCodes = costCodes.filter((c) => !c.archived && (!receipt.groupId || c.groupId === receipt.groupId || !c.groupId));
  const showConversion = settings && receipt.currency && receipt.currency !== settings.homeCurrency;

  const likelyDuplicate = findLikelyDuplicate(
    { date: receipt.date, vendor: receipt.vendor, totalIncTax: receiptTotalIncTax(receipt), pdfHash: receipt.pdfHash },
    receipts.filter((r) => r.id !== receipt.id)
  );

  // Vendor memory (PROJECT_PLAN.md §7 candidate 2): suggest, never auto-apply,
  // a cost code based on how past receipts from a closely-matching vendor
  // were coded. Only offered while the receipt has no code yet, and only
  // among codes selectable in the current group (so applying it is always
  // valid in the dropdown above).
  const vendorCodeSuggestion =
    !receipt.codeId && receipt.vendor?.trim() ? suggestCodeForVendor(receipt.vendor, codeSuggestionCandidates) : undefined;
  const suggestedCodeName = vendorCodeSuggestion ? costCodes.find((c) => c.id === vendorCodeSuggestion.codeId)?.name : undefined;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-bold text-graphite dark:text-stone">Receipt Details</h1>

      {pages.length > 0 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold text-graphite dark:text-stone mb-2">Receipt Document</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {pages.map((page, i) =>
              page.mimeType === 'application/pdf' ? (
                <a
                  key={i}
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-24 flex flex-col items-center justify-center gap-1 rounded border border-graphite/20 dark:border-white/20 bg-stone/50 dark:bg-ink/40 text-graphite dark:text-stone hover:bg-stone dark:hover:bg-ink"
                >
                  <FileText size={20} />
                  <span className="text-xs">Open PDF</span>
                </a>
              ) : (
                <img key={i} src={page.url} alt={`Receipt page ${i + 1}`} className="w-full h-24 object-cover rounded border border-graphite/20 dark:border-white/20" />
              )
            )}
          </div>
        </Panel>
      )}

      <Panel className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="receipt-date" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Date *
            </label>
            <Input id="receipt-date" type="date" value={receipt.date} onChange={(e) => update({ date: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="receipt-vendor" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Vendor
            </label>
            <Input id="receipt-vendor" value={receipt.vendor ?? ''} onChange={(e) => update({ vendor: e.target.value })} />
          </div>
          <div>
            <label htmlFor="receipt-group" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Group
            </label>
            <select
              id="receipt-group"
              value={receipt.groupId ?? ''}
              onChange={(e) => update({ groupId: e.target.value || undefined, codeId: undefined })}
              className="w-full px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone"
            >
              <option value="">Uncategorized</option>
              {groups.filter((g) => !g.archived).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="receipt-code" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Cost Code
            </label>
            <select
              id="receipt-code"
              value={receipt.codeId ?? ''}
              onChange={(e) => update({ codeId: e.target.value || undefined })}
              className="w-full px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone"
            >
              <option value="">No code</option>
              {availableCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="receipt-number" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Receipt Number
            </label>
            <Input id="receipt-number" value={receipt.receiptNumber ?? ''} onChange={(e) => update({ receiptNumber: e.target.value })} />
          </div>
          <div>
            <label htmlFor="receipt-currency" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              Currency
            </label>
            <Input
              id="receipt-currency"
              value={receipt.currency}
              onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
              maxLength={8}
            />
          </div>
          {showConversion && (
            <div>
              <label htmlFor="receipt-converted" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
                Converted Amount ({settings?.homeCurrency})
              </label>
              <Input
                id="receipt-converted"
                type="number"
                step="0.01"
                value={receipt.convertedAmount ?? ''}
                onChange={(e) => update({ convertedAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="receipt-note" className="block text-sm font-medium text-graphite dark:text-stone mb-1">
            Note
          </label>
          <textarea
            id="receipt-note"
            value={receipt.note ?? ''}
            onChange={(e) => update({ note: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-graphite dark:text-stone">
          <input type="checkbox" checked={receipt.billable} onChange={(e) => update({ billable: e.target.checked })} />
          Billable
        </label>
      </Panel>

      <Panel className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-graphite dark:text-stone">Tax Mode</h2>
          <div className="flex rounded-panel border border-graphite/20 dark:border-white/20 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setTaxMode('header')}
              className={`px-3 py-1.5 ${receipt.taxMode === 'header' ? 'bg-graphite text-stone dark:bg-stone dark:text-ink' : 'bg-white dark:bg-graphite text-graphite dark:text-stone'}`}
            >
              Header
            </button>
            <button
              type="button"
              onClick={() => setTaxMode('itemized')}
              className={`px-3 py-1.5 ${receipt.taxMode === 'itemized' ? 'bg-graphite text-stone dark:bg-stone dark:text-ink' : 'bg-white dark:bg-graphite text-graphite dark:text-stone'}`}
            >
              Itemized
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {receipt.lineItems.map((li) => (
            <div key={li.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              {receipt.taxMode === 'itemized' && (
                <Input
                  placeholder="Description"
                  value={li.description ?? ''}
                  onChange={(e) => updateLineItem(li.id, { description: e.target.value })}
                  className="flex-1"
                />
              )}
              <Input
                type="number"
                step="0.01"
                placeholder="Ex tax"
                aria-label="Amount ex tax"
                value={li.amountExTax ?? ''}
                onChange={(e) => updateLineItem(li.id, { amountExTax: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="sm:w-32"
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Inc tax"
                aria-label="Amount inc tax"
                value={li.amountIncTax ?? ''}
                onChange={(e) => updateLineItem(li.id, { amountIncTax: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="sm:w-32"
              />
              {receipt.taxMode === 'itemized' && receipt.lineItems.length > 1 && (
                <button type="button" aria-label="Remove line" onClick={() => removeLineItem(li.id)} className="p-2 text-rust">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        {receipt.taxMode === 'itemized' && (
          <Button variant="ghost" size="sm" onClick={addLineItem}>
            <Plus size={14} className="mr-1" /> Add Line
          </Button>
        )}
      </Panel>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Custom Fields</h2>
        {(settings?.customFieldDefinitions ?? []).map((def) => (
          <div key={def.id}>
            <label htmlFor={`custom-${def.id}`} className="block text-sm font-medium text-graphite dark:text-stone mb-1">
              {def.label}
            </label>
            <Input
              id={`custom-${def.id}`}
              value={receipt.customFields?.[def.id] ?? ''}
              onChange={(e) => setCustomField(def.id, e.target.value)}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Add a field (e.g. Vendor Tax Number)"
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
          />
          <Button variant="secondary" onClick={addCustomFieldDefinition} disabled={!newFieldLabel.trim()}>
            Add Field
          </Button>
        </div>
      </Panel>

      {vendorCodeSuggestion && suggestedCodeName && (
        <Panel className="p-4 border-verdigris bg-verdigris/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-graphite dark:text-stone">
            Past receipts from <strong>{vendorCodeSuggestion.matchedVendor}</strong> used cost code{' '}
            <strong>{suggestedCodeName}</strong>.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update({ codeId: vendorCodeSuggestion.codeId })}
          >
            Use this code
          </Button>
        </Panel>
      )}

      {likelyDuplicate && (
        <Panel className="p-4 border-signal bg-signal/10 text-sm text-graphite dark:text-stone">
          This looks like it might be a duplicate of a receipt already saved
          {likelyDuplicate.vendor ? ` for ${likelyDuplicate.vendor}` : ''} on {likelyDuplicate.date}. You can still save —
          this is just a heads-up.
        </Panel>
      )}

      <div className="flex justify-between">
        {original && (
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="ghost" onClick={() => navigate('/')}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!receipt.date}>
            Save Receipt
          </Button>
        </div>
      </div>
    </div>
  );
};
