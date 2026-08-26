import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { CaptureInput } from '../components/capture/CaptureInput';
import { CropEditor } from '../components/capture/CropEditor';
import { cropImageToRect, fileToImage, type Point } from '../utils/image';
import { putBlob } from '../db';
import { useAppData } from '../context/AppDataContext';
import type { Receipt } from '../types';

interface CapturedPage {
  id: string;
  blob: Blob;
  previewUrl: string;
}

export const CaptureReceipt: React.FC = () => {
  const navigate = useNavigate();
  const { settings, saveReceipt } = useAppData();
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File) => {
    setError(null);
    try {
      const img = await fileToImage(file);
      setPendingImage(img);
      setPendingImageUrl(URL.createObjectURL(file));
    } catch {
      setError(
        file.type === 'application/pdf'
          ? 'This build can’t crop a PDF directly yet — please upload a photo or scanned image instead.'
          : 'Could not read that file as an image. Please try a different photo or file.'
      );
    }
  };

  const handleCropConfirm = async (corners: Point[]) => {
    if (!pendingImage) return;
    const blob = await cropImageToRect(pendingImage, corners);
    const previewUrl = URL.createObjectURL(blob);
    setPages((prev) => [...prev, { id: crypto.randomUUID(), blob, previewUrl }]);
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setPendingImage(null);
    setPendingImageUrl(null);
  };

  const handleCropCancel = () => {
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setPendingImage(null);
    setPendingImageUrl(null);
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleContinue = async () => {
    if (pages.length === 0) return;
    setSaving(true);
    try {
      const pageBlobRefs: string[] = [];
      for (const page of pages) {
        const id = crypto.randomUUID();
        await putBlob({ id, blob: page.blob, mimeType: page.blob.type || 'image/jpeg', createdAt: new Date().toISOString() });
        pageBlobRefs.push(id);
      }

      const now = new Date().toISOString();
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        date: now.slice(0, 10),
        taxMode: 'header',
        lineItems: [{ id: crypto.randomUUID() }],
        currency: settings?.homeCurrency ?? 'USD',
        billable: false,
        // TODO(phase-2): replace with the merged, compressed PDF blob ref.
        pdfBlobRef: pageBlobRefs[0],
        pageBlobRefs,
        createdAt: now,
        updatedAt: now,
      };
      await saveReceipt(receipt);
      navigate(`/receipts/${receipt.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (pendingImageUrl) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-bold text-graphite dark:text-stone mb-4">Crop Receipt</h1>
        <Panel className="p-4">
          <CropEditor imageUrl={pendingImageUrl} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-bold text-graphite dark:text-stone">New Receipt</h1>

      <Panel className="p-4 space-y-4">
        <CaptureInput onFileSelected={handleFileSelected} />

        {error && <p className="text-sm text-rust">{error}</p>}

        {pages.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-graphite dark:text-stone mb-2">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'} captured
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {pages.map((page, i) => (
                <div key={page.id} className="relative">
                  <img src={page.previewUrl} alt={`Page ${i + 1}`} className="w-full h-24 object-cover rounded border border-graphite/20 dark:border-white/20" />
                  <button
                    type="button"
                    onClick={() => removePage(page.id)}
                    aria-label={`Remove page ${i + 1}`}
                    className="absolute top-1 right-1 p-1 bg-rust text-white rounded-full"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-1">
              <Plus size={14} /> Use "Take Photo" or "Upload File" above to add another page.
            </p>
          </div>
        )}
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" size="lg" disabled={pages.length === 0 || saving} onClick={handleContinue}>
          {saving ? 'Saving…' : 'Continue to Details'}
        </Button>
      </div>
    </div>
  );
};
