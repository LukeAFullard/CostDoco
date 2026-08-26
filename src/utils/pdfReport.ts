import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_PRINT_BASE64 } from '../logoPrint';
import type { CostCode, Group, Receipt } from '../types';
import { receiptTotalIncTax, taxAmount } from '../types';
import { computeReportTotals, groupTotalsByCode, groupTotalsByGroup } from './reportTotals';

export interface ReceiptsReportOptions {
  receipts: Receipt[];
  groups: Group[];
  costCodes: CostCode[];
  homeCurrency: string;
  scopeLabel?: string; // e.g. "Client A" or "All Receipts"
  dateRangeLabel?: string; // e.g. "Jan 1 – Jan 31, 2026"
}

function money(n: number): string {
  return n.toFixed(2);
}

// jspdf-autotable's published types don't declare the `lastAutoTable` property
// it attaches to the jsPDF instance after each call (types jsPDFDocument as `any`).
function lastAutoTableEndY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Reuses jsPDF + jspdf-autotable, matching TimeDoco's existing export code/style
 * (logo header, meta lines, autoTable summary + detail tables, page-numbered
 * footer). Appending the original receipt PDFs is a user-facing toggle in the
 * plan but is not implemented here: merging externally-generated PDF byte
 * streams into this document needs a PDF-merging library (e.g. pdf-lib) that
 * isn't part of the project's dependency set — a follow-up, not silently
 * dropped.
 */
export async function generateReceiptsReportPdf(options: ReceiptsReportOptions): Promise<Blob> {
  const { receipts, groups, costCodes, homeCurrency, scopeLabel, dateRangeLabel } = options;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.addImage(LOGO_PRINT_BASE64, 'PNG', 14, 10, 37.5, 10);
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text('Expense Report', pageWidth - 14, 15, { align: 'right' });
  };

  let headerDrawnPage = 0;
  const ensureHeader = (pageNumber: number) => {
    if (pageNumber === headerDrawnPage) return;
    headerDrawnPage = pageNumber;
    drawHeader();
  };
  ensureHeader(1);

  let y = 28;
  doc.setFontSize(10);
  doc.setTextColor(60);
  const metaLine = (label: string, value: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 45, y);
    y += 5;
  };
  metaLine('Scope:', scopeLabel ?? 'All Receipts');
  metaLine('Period:', dateRangeLabel ?? 'All dates');
  metaLine('Generated:', new Date().toLocaleString());
  metaLine('Currency:', homeCurrency);

  y += 3;
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary by Group', 14, y);

  const byGroup = groupTotalsByGroup(receipts, groups, homeCurrency);
  autoTable(doc, {
    startY: y + 4,
    head: [['Group', 'Receipts', `Total (${homeCurrency})`]],
    body: byGroup.map((g) => [g.label, String(g.receiptCount), money(g.total)]),
    margin: { top: 25 },
    didDrawPage: (data) => ensureHeader(data.pageNumber),
  });

  y = lastAutoTableEndY(doc) + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary by Cost Code', 14, y);

  const byCode = groupTotalsByCode(receipts, costCodes, homeCurrency);
  autoTable(doc, {
    startY: y + 4,
    head: [['Cost Code', 'Receipts', `Total (${homeCurrency})`]],
    body: byCode.map((c) => [c.label, String(c.receiptCount), money(c.total)]),
    margin: { top: 25 },
    didDrawPage: (data) => ensureHeader(data.pageNumber),
  });

  y = lastAutoTableEndY(doc) + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Receipt Detail', 14, y);

  const groupName = (id?: string) => (id ? groups.find((g) => g.id === id)?.name ?? 'Unknown group' : 'Uncategorized');
  const codeName = (id?: string) => (id ? costCodes.find((c) => c.id === id)?.name ?? 'Unknown code' : '—');

  const detailRows = receipts.flatMap((receipt) =>
    receipt.lineItems.map((item) => [
      receipt.date,
      receipt.vendor ?? '—',
      item.description ?? '—',
      groupName(receipt.groupId),
      codeName(receipt.codeId),
      `${receipt.currency} ${money(item.amountIncTax ?? item.amountExTax ?? 0)}`,
      money(taxAmount(item) ?? 0),
    ])
  );

  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Vendor', 'Description', 'Group', 'Code', 'Amount', 'Tax']],
    body: detailRows,
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { top: 25 },
    didDrawPage: (data) => ensureHeader(data.pageNumber),
  });

  y = lastAutoTableEndY(doc) + 10;

  const totals = computeReportTotals(receipts, homeCurrency);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total (${homeCurrency}): ${money(totals.convertedTotal)}`, 14, y);
  y += 8;

  if (totals.unconverted.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(180, 100, 40);
    doc.text(`${totals.unconverted.length} receipt(s) in a foreign currency have no converted amount and are excluded above:`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const r of totals.unconverted) {
      doc.text(`${r.date} — ${r.vendor ?? 'Unknown vendor'} — ${r.currency} ${money(receiptTotalIncTax(r))}`, 18, y);
      y += 4.5;
    }
  }

  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('Generated with CostDoco', 14, doc.internal.pageSize.getHeight() - 8);
  }
  return doc.output('blob');
}
