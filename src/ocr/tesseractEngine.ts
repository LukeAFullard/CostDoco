import type { OcrEngine, OcrResult } from '@llamaindex/liteparse-wasm';
import type { Worker } from 'tesseract.js';

// Lazy singletons: one worker per language, created on first use so tesseract.js's
// wasm core + language data are never fetched until OCR actually runs.
const workers = new Map<string, Promise<Worker>>();

async function getWorker(language: string): Promise<Worker> {
  let worker = workers.get(language);
  if (!worker) {
    worker = import('tesseract.js').then(({ createWorker }) => createWorker(language));
    workers.set(language, worker);
  }
  return worker;
}

/** Releases every tesseract.js worker created so far. Call on app/session teardown. */
export async function terminateOcrWorkers(): Promise<void> {
  const pending = Array.from(workers.values());
  workers.clear();
  await Promise.all(pending.map(async (workerPromise) => (await workerPromise).terminate()));
}

/**
 * Wraps tesseract.js as the `ocrEngine.recognize` callback liteparse-wasm expects
 * (see docs/implementation/00-foundation.md step 6). Returns one OcrResult per
 * recognized *line* — matching the field-matching heuristic's assumption that a
 * keyword and its amount are each a whole line, not scattered per-word.
 */
export function createTesseractOcrEngine(): OcrEngine {
  return {
    async recognize(imageData: Uint8Array, _width: number, _height: number, language: string): Promise<OcrResult[]> {
      const worker = await getWorker(language || 'eng');
      const blob = new Blob([new Uint8Array(imageData)], { type: 'image/png' });
      const { data } = await worker.recognize(blob, {}, { blocks: true });

      const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));

      return lines.map((line) => ({
        text: line.text.trim(),
        bbox: [line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1],
        confidence: line.confidence / 100,
      }));
    },
  };
}
