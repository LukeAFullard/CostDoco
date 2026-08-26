import { jsPDF } from 'jspdf';

/** One page's image content, already re-encoded at the desired compression quality. */
export interface PdfPage {
  dataUrl: string; // data:image/jpeg;base64,... (or any format jsPDF's addImage accepts)
  width: number; // pixels
  height: number; // pixels
}

/**
 * Builds a one-image-per-page PDF from already-encoded page images.
 *
 * `@llamaindex/liteparse-wasm` (see docs/implementation/06-open-questions-resolved.md
 * §2 for the pinned version) is a PDF *parser* — it has no image→PDF conversion API,
 * unlike what the original plan assumed. jsPDF (already a planned dependency for PDF
 * reports, per PROJECT_PLAN.md §5) fills that gap instead.
 */
export async function buildReceiptPdf(pages: PdfPage[]): Promise<Blob> {
  if (pages.length === 0) throw new Error('buildReceiptPdf requires at least one page');

  const [first, ...rest] = pages;
  const doc = new jsPDF({ unit: 'px', format: [first.width, first.height] });
  doc.addImage(first.dataUrl, 'JPEG', 0, 0, first.width, first.height);

  for (const page of rest) {
    doc.addPage([page.width, page.height]);
    doc.addImage(page.dataUrl, 'JPEG', 0, 0, page.width, page.height);
  }

  return doc.output('blob');
}

/** JPEG re-encode quality (0..1) per compression preset, applied before building the PDF. */
export const COMPRESSION_PRESETS = {
  high: 0.92,
  recommended: 0.75,
  smallest: 0.5,
} as const;

export type CompressionPreset = keyof typeof COMPRESSION_PRESETS;

export const COMPRESSION_PRESET_LABELS: Record<CompressionPreset, string> = {
  high: 'High quality',
  recommended: 'Recommended',
  smallest: 'Smallest',
};
