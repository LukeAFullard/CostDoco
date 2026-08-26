import type { ParseResult, PageComplexityStats } from '@llamaindex/liteparse-wasm';
import type { OcrBox } from '../types';
import { createTesseractOcrEngine } from './tesseractEngine';

let liteParseModule: Promise<typeof import('@llamaindex/liteparse-wasm')> | null = null;

/** Lazy-loads liteparse-wasm (and initializes the wasm module) on first use, not app start. */
async function loadLiteParse() {
  if (!liteParseModule) {
    liteParseModule = import('@llamaindex/liteparse-wasm').then(async (mod) => {
      await mod.default();
      return mod;
    });
  }
  return liteParseModule;
}

/** Flattens a liteparse ParseResult's per-page text items into the receipt's OcrBox list. */
export function flattenParseResult(result: ParseResult): OcrBox[] {
  const boxes: OcrBox[] = [];
  result.pages.forEach((page, pageIndex) => {
    for (const item of page.textItems) {
      const text = item.text.trim();
      if (!text) continue;
      boxes.push({
        page: pageIndex,
        text,
        bbox: [item.x, item.y, item.x + item.width, item.y + item.height],
        confidence: (item.confidence ?? 100) / 100,
      });
    }
  });
  return boxes;
}

export interface PipelineResult {
  ocrBoxes: OcrBox[];
  pageComplexity: PageComplexityStats[];
}

/**
 * Runs the full liteparse pipeline against PDF bytes: a cheap complexity pass
 * (routes each page to OCR only when it needs it — a real text layer is left
 * alone) followed by the parse itself, with tesseract.js wired in as the
 * browser-side OCR engine. Works the same whether `pdfBytes` came from
 * `buildReceiptPdf` (captured photos) or an uploaded PDF file.
 */
export async function runOcrPipeline(pdfBytes: Uint8Array): Promise<PipelineResult> {
  const { LiteParse } = await loadLiteParse();
  const parser = new LiteParse({ ocrEnabled: true, ocrEngine: createTesseractOcrEngine() });

  const pageComplexity = await parser.isComplex(pdfBytes);
  const result = await parser.parse(pdfBytes);

  return { ocrBoxes: flattenParseResult(result), pageComplexity };
}
