import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { OcrReview } from './OcrReview';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, getBlob, getReceipt, getSettings, putBlob, putReceipt, putSettings } from '../db';
import type { Receipt } from '../types';
import { runOcrPipeline } from '../ocr/pipeline';
import * as imageUtils from '../utils/image';

const TINY_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

vi.mock('../ocr/pipeline', () => ({
  runOcrPipeline: vi.fn(),
}));

vi.mock('../utils/image', async () => {
  const actual = await vi.importActual<typeof import('../utils/image')>('../utils/image');
  return {
    ...actual,
    blobToPdfPage: vi.fn(async () => ({ dataUrl: TINY_JPEG_DATA_URL, width: 100, height: 100 })),
  };
});

// fake-indexeddb's structured clone under jsdom doesn't preserve Blob's prototype
// (a round-tripped blob loses .arrayBuffer()/.size — see src/db/index.test.ts's
// "round-trips a blob" test for the same limitation), so the native-PDF path,
// which calls .arrayBuffer() directly on a db-fetched blob, needs a real Blob
// injected past that round trip rather than relying on it in tests.
vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db');
  return { ...actual, getBlob: vi.fn(actual.getBlob) };
});

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    date: '2026-08-26',
    taxMode: 'header',
    lineItems: [{ id: crypto.randomUUID() }],
    currency: 'USD',
    billable: false,
    pdfBlobRef: 'raw-1',
    pageBlobRefs: ['raw-1'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const renderPage = (receiptId: string) =>
  render(
    <MemoryRouter initialEntries={[`/receipts/${receiptId}/review`]}>
      <AppDataProvider>
        <Routes>
          <Route path="/receipts/:id/review" element={<OcrReview />} />
          <Route path="/receipts/:id" element={<div>Receipt Details</div>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>
  );

describe('OcrReview', () => {
  it('runs OCR on a photo-sourced receipt, detects the total, and finalizes with a compressed PDF', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({
      ocrBoxes: [{ page: 0, text: 'TOTAL $11.50', bbox: [10, 20, 90, 32], confidence: 0.95 }],
      pageComplexity: [],
    });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);

    expect(await screen.findByText(/processing receipt/i)).toBeInTheDocument();
    expect(await screen.findByText(/total \(inc\. tax\)/i)).toBeInTheDocument();
    expect(screen.getByText('11.50')).toBeInTheDocument();

    // Compression preset controls only apply to photo-sourced receipts.
    expect(screen.getByText('Recommended')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue to Details'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.pdfBlobRef).not.toBe('raw-1');
      expect(saved?.lineItems[0].amountIncTax).toBe(11.5);
      expect(saved?.ocrBoxes).toHaveLength(1);
    });
    expect(await screen.findByText('Receipt Details')).toBeInTheDocument();

    // The original uncompressed page blob should be discarded once the final PDF exists.
    expect(await getBlob('raw-1')).toBeUndefined();
  });

  it('routes a single uploaded PDF straight through without a compression choice', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({ ocrBoxes: [], pageComplexity: [] });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    vi.mocked(getBlob).mockResolvedValueOnce({
      id: 'raw-1',
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      mimeType: 'application/pdf',
      createdAt: new Date().toISOString(),
    });

    renderPage(receipt.id);

    await screen.findByText(/no total detected/i);
    expect(screen.queryByText('Compression')).not.toBeInTheDocument();
    expect(imageUtils.blobToPdfPage).not.toHaveBeenCalled();
  });

  it('lets the user skip OCR entirely and still produces a saved receipt', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({
      ocrBoxes: [{ page: 0, text: 'TOTAL $11.50', bbox: [10, 20, 90, 32], confidence: 0.95 }],
      pageComplexity: [],
    });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);
    await screen.findByText(/total \(inc\. tax\)/i);

    fireEvent.click(screen.getByText('Skip OCR'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.ocrBoxes).toBeUndefined();
      expect(saved?.lineItems[0].amountIncTax).toBeUndefined();
    });
  });

  it('disables Skip OCR & Continue until the page blobs have actually loaded', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({ ocrBoxes: [], pageComplexity: [] });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    let resolveBlob!: (value: Awaited<ReturnType<typeof getBlob>>) => void;
    vi.mocked(getBlob).mockReturnValueOnce(new Promise((resolve) => { resolveBlob = resolve; }));

    renderPage(receipt.id);

    const skipButton = await screen.findByText('Loading pages…');
    expect(skipButton).toBeDisabled();
    fireEvent.click(skipButton);
    // Clicking while disabled must not throw or silently no-op into a broken state.
    expect(await getReceipt(receipt.id)).toEqual(receipt);

    resolveBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });
    // The pipeline proceeds normally once the blob resolves — no crash, no stuck state.
    expect(await screen.findByText('Review Receipt')).toBeInTheDocument();
  });

  it('shows how many pages actually needed OCR vs. already had readable text', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({
      ocrBoxes: [],
      pageComplexity: [
        { pageNumber: 1, needsOcr: true } as never,
        { pageNumber: 2, needsOcr: false } as never,
      ],
    });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);

    expect(await screen.findByText(/OCR ran on 1 of 2 pages/i)).toBeInTheDocument();
    expect(screen.getByText(/already had a readable text layer/i)).toBeInTheDocument();
  });

  it('skips the OCR pipeline entirely when OCR is turned off in Settings', async () => {
    await putSettings({ ...(await getSettings()), ocrEnabled: false });

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);

    expect(await screen.findByText(/ocr is turned off in settings/i)).toBeInTheDocument();
    expect(runOcrPipeline).not.toHaveBeenCalled();
    expect(screen.queryByText('Skip OCR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue to Details'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.ocrBoxes).toBeUndefined();
      expect(saved?.lineItems[0].amountIncTax).toBeUndefined();
      expect(saved?.pdfBlobRef).not.toBe('raw-1');
    });
  });

  it('does not apply a detected total to a line item in itemized mode', async () => {
    vi.mocked(runOcrPipeline).mockResolvedValue({
      ocrBoxes: [{ page: 0, text: 'TOTAL $11.50', bbox: [10, 20, 90, 32], confidence: 0.95 }],
      pageComplexity: [],
    });

    const receipt = makeReceipt({
      taxMode: 'itemized',
      lineItems: [
        { id: crypto.randomUUID(), description: 'Nails' },
        { id: crypto.randomUUID(), description: 'Screws' },
      ],
    });
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);
    expect(await screen.findByText(/total \(inc\. tax\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue to Details'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.lineItems).toHaveLength(2);
      expect(saved?.lineItems[0].amountIncTax).toBeUndefined();
      expect(saved?.lineItems[1].amountIncTax).toBeUndefined();
      // The detected total was still recorded for reference, just not forced onto a line item.
      expect(saved?.ocrBoxes).toHaveLength(1);
    });
  });

  it('falls back to a working Continue button when the OCR pipeline throws', async () => {
    vi.mocked(runOcrPipeline).mockRejectedValue(new Error('wasm init failed'));

    const receipt = makeReceipt();
    await putReceipt(receipt);
    await putBlob({ id: 'raw-1', blob: new Blob(['raw'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', createdAt: new Date().toISOString() });

    renderPage(receipt.id);

    expect(await screen.findByText(/ocr processing failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue Without OCR'));

    await waitFor(async () => {
      const saved = await getReceipt(receipt.id);
      expect(saved?.pdfBlobRef).not.toBe('raw-1');
    });
  });
});
