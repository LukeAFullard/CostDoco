import type { OcrBox } from '../types';

export interface FieldMatch {
  value: number;
  box: OcrBox;
}

export interface MatchedFields {
  amountIncTax?: FieldMatch;
  amountExTax?: FieldMatch;
  receiptNumber?: { value: string; box: OcrBox };
}

// Locale-configurable keyword lists (English defaults), per the plan's field-matching step.
const TOTAL_KEYWORDS = ['total', 'amount due', 'balance due', 'grand total'];
const SUBTOTAL_KEYWORDS = ['subtotal', 'sub-total', 'sub total'];
const TAX_KEYWORDS = ['gst', 'tax', 'vat', 'sales tax'];
const RECEIPT_NUMBER_KEYWORDS = ['receipt no', 'receipt #', 'receipt number', 'invoice no', 'invoice #', 'order no'];

// Comma-grouped branch requires at least one ",ddd" group so it only claims
// genuinely comma-formatted numbers (e.g. "1,234.56"); anything else — including
// a plain 4+ digit amount like "1234.56" with no separator — falls through to
// the second branch, which is greedy about digit count instead of capping at 3.
const CURRENCY_NUMBER = /-?\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;

function extractNumber(text: string): number | undefined {
  const match = text.match(CURRENCY_NUMBER);
  if (!match) return undefined;
  const num = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(num) ? num : undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word/phrase match, so "total" doesn't fire inside "subtotal". */
function findKeywordMatch(text: string, keywords: string[]): { keyword: string; index: number; length: number } | undefined {
  for (const kw of keywords) {
    const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
    const match = text.match(re);
    if (match && match.index != null) return { keyword: kw, index: match.index, length: match[0].length };
  }
  return undefined;
}

function containsKeyword(text: string, keywords: string[]): boolean {
  return findKeywordMatch(text, keywords) != null;
}

/**
 * Best-effort match of currency-formatted numbers near keywords ("total", "gst",
 * "tax", "vat", ...). Returns undefined for a field when nothing confident is
 * found — this never blocks manual entry, it only pre-fills when it can.
 *
 * `items` should be in reading order (top-to-bottom, matching liteparse's OCR
 * output) so an amount on the line *after* a keyword-only line can still match.
 */
export function matchFields(items: OcrBox[]): MatchedFields {
  const result: MatchedFields = {};

  const findAmount = (keywords: string[]): FieldMatch | undefined => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!containsKeyword(item.text, keywords)) continue;

      const sameLine = extractNumber(item.text);
      if (sameLine != null) return { value: sameLine, box: item };

      const next = items[i + 1];
      if (next && next.page === item.page) {
        const nextLine = extractNumber(next.text);
        if (nextLine != null) return { value: nextLine, box: next };
      }
    }
    return undefined;
  };

  const total = findAmount(TOTAL_KEYWORDS);
  if (total) result.amountIncTax = total;

  const subtotal = findAmount(SUBTOTAL_KEYWORDS);
  if (subtotal) {
    result.amountExTax = subtotal;
  } else {
    const tax = findAmount(TAX_KEYWORDS);
    if (tax && total) {
      result.amountExTax = { value: Number((total.value - tax.value).toFixed(2)), box: tax.box };
    }
  }

  const looksLikeCode = (text: string) => /^[A-Za-z0-9-]{3,}$/.test(text) && /\d/.test(text);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const keywordMatch = findKeywordMatch(item.text, RECEIPT_NUMBER_KEYWORDS);
    if (!keywordMatch) continue;

    const remainder = item.text.slice(keywordMatch.index + keywordMatch.length).replace(/^[\s:#-]+/, '').trim();
    if (looksLikeCode(remainder)) {
      result.receiptNumber = { value: remainder, box: item };
      break;
    }

    const next = items[i + 1];
    const nextText = next?.text.trim();
    if (next && next.page === item.page && nextText && looksLikeCode(nextText)) {
      result.receiptNumber = { value: nextText, box: next };
      break;
    }
  }

  return result;
}
