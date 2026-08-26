import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { CaptureReceipt } from './CaptureReceipt';
import { AppDataProvider } from '../context/AppDataContext';
import { closeDB, getReceipts } from '../db';
import * as imageUtils from '../utils/image';

vi.mock('../utils/image', async () => {
  const actual = await vi.importActual<typeof import('../utils/image')>('../utils/image');
  return {
    ...actual,
    fileToImage: vi.fn(async () => new Image()),
    cropImageToRect: vi.fn(async () => new Blob(['cropped'], { type: 'image/jpeg' })),
  };
});

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/receipts/new']}>
      <AppDataProvider>
        <Routes>
          <Route path="/receipts/new" element={<CaptureReceipt />} />
          <Route path="/receipts/:id/review" element={<div>OCR Review</div>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>
  );

describe('CaptureReceipt', () => {
  it('captures a page, crops it, and saves a receipt with the cropped page attached', async () => {
    renderPage();

    const file = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
    const cameraInput = await screen.findByLabelText('Take photo');
    fireEvent.change(cameraInput, { target: { files: [file] } });

    fireEvent.click(await screen.findByText('Confirm Crop'));

    expect(await screen.findByText(/1 page captured/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(async () => {
      const receipts = await getReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0].pageBlobRefs).toHaveLength(1);
      expect(receipts[0].pdfBlobRef).toBe(receipts[0].pageBlobRefs[0]);
    });
    expect(await screen.findByText('OCR Review')).toBeInTheDocument();
  });

  it('supports capturing multiple pages before continuing', async () => {
    renderPage();

    for (let i = 0; i < 2; i++) {
      const file = new File(['data'], `receipt-${i}.jpg`, { type: 'image/jpeg' });
      const cameraInput = await screen.findByLabelText('Take photo');
      fireEvent.change(cameraInput, { target: { files: [file] } });
      fireEvent.click(await screen.findByText('Confirm Crop'));
    }

    expect(await screen.findByText(/2 pages captured/i)).toBeInTheDocument();
  });

  it('disables Continue until at least one page is captured', async () => {
    renderPage();
    expect(await screen.findByText('Continue')).toBeDisabled();
  });

  it('shows a friendly error instead of hanging when a file cannot be read as an image', async () => {
    vi.mocked(imageUtils.fileToImage).mockRejectedValueOnce(new Error('decode failed'));
    renderPage();

    const file = new File(['not an image'], 'receipt.txt', { type: 'text/plain' });
    const uploadInput = await screen.findByLabelText('Upload file');
    fireEvent.change(uploadInput, { target: { files: [file] } });

    expect(await screen.findByText(/could not read that file as an image/i)).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeDisabled();
  });

  it('accepts an uploaded PDF directly as a single page, without cropping', async () => {
    renderPage();

    const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });
    const uploadInput = await screen.findByLabelText('Upload file');
    fireEvent.change(uploadInput, { target: { files: [file] } });

    expect(await screen.findByText(/1 page captured/i)).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(imageUtils.fileToImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Continue'));

    await waitFor(async () => {
      const receipts = await getReceipts();
      expect(receipts).toHaveLength(1);
    });
  });

  it('rejects mixing an uploaded PDF with photo pages', async () => {
    renderPage();

    const photo = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
    fireEvent.change(await screen.findByLabelText('Take photo'), { target: { files: [photo] } });
    fireEvent.click(await screen.findByText('Confirm Crop'));
    await screen.findByText(/1 page captured/i);

    const pdf = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Upload file'), { target: { files: [pdf] } });

    expect(await screen.findByText(/can’t be mixed with photos/i)).toBeInTheDocument();
    expect(screen.getByText(/1 page captured/i)).toBeInTheDocument();
  });

  it('rejects adding a photo once a PDF page has been uploaded', async () => {
    renderPage();

    const pdf = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Upload file'), { target: { files: [pdf] } });
    await screen.findByText(/1 page captured/i);

    const photo = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Take photo'), { target: { files: [photo] } });

    expect(await screen.findByText(/already has an uploaded pdf page/i)).toBeInTheDocument();
    expect(imageUtils.fileToImage).not.toHaveBeenCalled();
  });
});
