import { describe, it, expect } from 'vitest';
import { flattenParseResult } from './pipeline';
import type { ParseResult, ParsedPage, TextItem } from '@llamaindex/liteparse-wasm';

const textItem = (overrides: Partial<TextItem> = {}): TextItem => ({
  text: 'TOTAL $11.50',
  x: 10,
  y: 20,
  width: 80,
  height: 12,
  rotation: 0,
  ...overrides,
});

const page = (overrides: Partial<ParsedPage> = {}): ParsedPage => ({
  pageNum: 1,
  width: 600,
  height: 800,
  text: '',
  markdown: '',
  textItems: [],
  ...overrides,
});

const parseResult = (pages: ParsedPage[]): ParseResult => ({
  totalPages: pages.length,
  pages,
  text: '',
  images: [],
  screenshots: [],
  imageErrorCount: 0,
  pageErrors: [],
});

describe('flattenParseResult', () => {
  it('converts a text item into an OcrBox with a derived [x1,y1,x2,y2] bbox', () => {
    const boxes = flattenParseResult(parseResult([page({ textItems: [textItem()] })]));
    expect(boxes).toEqual([
      { page: 0, text: 'TOTAL $11.50', bbox: [10, 20, 90, 32], confidence: 1 },
    ]);
  });

  it('defaults confidence to 1 when the item has none (a native PDF text layer, not OCR)', () => {
    const boxes = flattenParseResult(parseResult([page({ textItems: [textItem({ confidence: undefined })] })]));
    expect(boxes[0].confidence).toBe(1);
  });

  it('scales a 0..100 OCR confidence down to 0..1', () => {
    const boxes = flattenParseResult(parseResult([page({ textItems: [textItem({ confidence: 87 })] })]));
    expect(boxes[0].confidence).toBeCloseTo(0.87);
  });

  it('tags each box with its 0-indexed page number', () => {
    const boxes = flattenParseResult(
      parseResult([page({ textItems: [textItem({ text: 'Page one' })] }), page({ textItems: [textItem({ text: 'Page two' })] })])
    );
    expect(boxes.map((b) => b.page)).toEqual([0, 1]);
  });

  it('skips blank/whitespace-only text items', () => {
    const boxes = flattenParseResult(parseResult([page({ textItems: [textItem({ text: '   ' }), textItem({ text: 'Real text' })] })]));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].text).toBe('Real text');
  });

  it('returns an empty array for a document with no pages', () => {
    expect(flattenParseResult(parseResult([]))).toEqual([]);
  });
});
