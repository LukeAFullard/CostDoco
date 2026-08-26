import { describe, it, expect } from 'vitest';
import { buildReceiptPdf, COMPRESSION_PRESETS } from './pdf';
import type { PdfPage } from './pdf';

// A valid 1x1 red JPEG, just enough for jsPDF's addImage to accept as real image data.
const TINY_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const page = (overrides: Partial<PdfPage> = {}): PdfPage => ({
  dataUrl: TINY_JPEG_DATA_URL,
  width: 200,
  height: 100,
  ...overrides,
});

describe('buildReceiptPdf', () => {
  it('builds a single-page PDF from one page image', async () => {
    const blob = await buildReceiptPdf([page()]);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('builds a multi-page PDF, growing with each added page', async () => {
    const onePage = await buildReceiptPdf([page()]);
    const twoPages = await buildReceiptPdf([page(), page({ width: 150, height: 300 })]);
    expect(twoPages.size).toBeGreaterThan(onePage.size);
  });

  it('rejects an empty page list rather than producing a blank document', async () => {
    await expect(buildReceiptPdf([])).rejects.toThrow(/at least one page/i);
  });
});

describe('COMPRESSION_PRESETS', () => {
  it('orders quality from smallest to highest', () => {
    expect(COMPRESSION_PRESETS.smallest).toBeLessThan(COMPRESSION_PRESETS.recommended);
    expect(COMPRESSION_PRESETS.recommended).toBeLessThan(COMPRESSION_PRESETS.high);
  });

  it('keeps every quality within the valid 0..1 range', () => {
    for (const quality of Object.values(COMPRESSION_PRESETS)) {
      expect(quality).toBeGreaterThan(0);
      expect(quality).toBeLessThanOrEqual(1);
    }
  });
});
