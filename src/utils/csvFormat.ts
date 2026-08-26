import type { CostCode, Group } from '../types';

/** Shared low-level formatting helpers for every CSV export template. */

export function escapeCSV(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const formatNum = (n: number | undefined) => (n == null ? '' : n.toFixed(2));

export const groupNameOf = (groups: Group[], id?: string) =>
  id ? groups.find((g) => g.id === id)?.name ?? '' : 'Uncategorized';

export const codeNameOf = (costCodes: CostCode[], id?: string) =>
  id ? costCodes.find((c) => c.id === id)?.name ?? '' : '';
