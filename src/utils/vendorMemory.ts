/**
 * Vendor memory / cost-code auto-suggest (Phase 5, PROJECT_PLAN.md §7 candidate 2).
 * Suggestion only — the caller must let the user apply it explicitly, never
 * auto-apply a suggested code without confirmation.
 */

export interface VendorCodeSuggestion {
  codeId: string;
  matchedVendor: string; // the historical vendor text that matched, for display
  count: number; // how many past receipts from a matching vendor used this code
}

function normalizeVendor(vendor: string): string {
  return vendor.trim().toLowerCase().replace(/\s+/g, ' ');
}

function vendorsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Treat one as a "close match" of the other only once both are long enough
  // that a short/generic string (e.g. "co") can't match everything.
  if (a.length >= 3 && b.length >= 3) {
    return a.includes(b) || b.includes(a);
  }
  return false;
}

/**
 * Given a vendor name being typed and a set of past receipts, suggests the
 * most frequently-used cost code among receipts from a closely-matching
 * vendor. Returns undefined when there's no vendor text or no match.
 */
export function suggestCodeForVendor(
  vendor: string,
  pastReceipts: Array<{ vendor?: string; codeId?: string }>
): VendorCodeSuggestion | undefined {
  const normalized = normalizeVendor(vendor);
  if (!normalized) return undefined;

  const tally = new Map<string, { count: number; vendor: string }>();
  for (const r of pastReceipts) {
    if (!r.codeId || !r.vendor) continue;
    if (!vendorsMatch(normalized, normalizeVendor(r.vendor))) continue;
    const entry = tally.get(r.codeId) ?? { count: 0, vendor: r.vendor };
    entry.count += 1;
    tally.set(r.codeId, entry);
  }

  let best: VendorCodeSuggestion | undefined;
  for (const [codeId, { count, vendor: matchedVendor }] of tally) {
    if (!best || count > best.count) {
      best = { codeId, matchedVendor, count };
    }
  }
  return best;
}
