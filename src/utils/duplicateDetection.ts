import type { Receipt } from '../types';
import { receiptTotalIncTax } from '../types';

export interface DuplicateCandidate {
  date: string;
  vendor?: string;
  totalIncTax: number;
  pdfHash?: string;
}

function normalizeVendor(vendor: string): string {
  return vendor.trim().toLowerCase().replace(/\s+/g, ' ');
}

const AMOUNT_EPSILON = 0.01;

/**
 * Non-blocking duplicate check: an exact `pdfHash` match is a near-certain
 * duplicate (same document re-imported); otherwise falls back to a fuzzy
 * match on (vendor, total, date), per the plan's duplicate-detection step.
 * Never prevents saving — callers surface this as a warning, not a block.
 */
export function findLikelyDuplicate(candidate: DuplicateCandidate, existing: Receipt[]): Receipt | undefined {
  if (candidate.pdfHash) {
    const hashMatch = existing.find((r) => r.pdfHash === candidate.pdfHash);
    if (hashMatch) return hashMatch;
  }

  return existing.find((r) => {
    if (r.date !== candidate.date) return false;
    if (Math.abs(receiptTotalIncTax(r) - candidate.totalIncTax) > AMOUNT_EPSILON) return false;
    if (candidate.vendor && r.vendor) {
      return normalizeVendor(candidate.vendor) === normalizeVendor(r.vendor);
    }
    // Same date and total with no vendor to compare on either side is still
    // a reasonable "likely duplicate" signal — surfaced as a warning either way.
    return true;
  });
}

/** SHA-256 of the blob's bytes, hex-encoded — used for the exact-match path above. */
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
