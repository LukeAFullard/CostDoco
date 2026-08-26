import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { useAppData } from '../context/AppDataContext';
import { getBlob, putBlob, deleteBlob } from '../db';
import { blobToPdfPage } from '../utils/image';
import { buildReceiptPdf, COMPRESSION_PRESETS, COMPRESSION_PRESET_LABELS, type CompressionPreset, type PdfPage } from '../utils/pdf';
import { hashBlob } from '../utils/duplicateDetection';
import { runOcrPipeline } from '../ocr/pipeline';
import { matchFields } from '../ocr/fieldMatch';
import type { OcrBox } from '../types';
import type { PageComplexityStats } from '@llamaindex/liteparse-wasm';

type Stage =
  | { kind: 'loading' }
  | { kind: 'ready'; firstPage: { url: string; width: number; height: number } | null; isNativePdf: boolean }
  | { kind: 'error'; message: string };

export const OcrReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { receipts, saveReceipt } = useAppData();

  const receipt = useMemo(() => receipts.find((r) => r.id === id), [receipts, id]);

  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [ocrBoxes, setOcrBoxes] = useState<OcrBox[]>([]);
  const [pageComplexity, setPageComplexity] = useState<PageComplexityStats[]>([]);
  const [preset, setPreset] = useState<CompressionPreset>('recommended');
  const [presetSize, setPresetSize] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [pageDataForPreset, setPageDataForPreset] = useState<{ images: Blob[]; nativePdfBytes: Uint8Array | null }>({
    images: [],
    nativePdfBytes: null,
  });
  const [finalizing, setFinalizing] = useState(false);
  const [zoomBox, setZoomBox] = useState<OcrBox | null>(null);
  const [pagesReady, setPagesReady] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const matches = useMemo(() => matchFields(ocrBoxes), [ocrBoxes]);

  // Run the pipeline once when the receipt's pages are known.
  useEffect(() => {
    if (!receipt) return;
    let cancelled = false;

    (async () => {
      try {
        const blobs = await Promise.all(receipt.pageBlobRefs.map((ref) => getBlob(ref)));
        const found = blobs.filter((b): b is NonNullable<typeof b> => !!b);
        if (found.length === 0) throw new Error('No captured pages found for this receipt.');

        const isNativePdf = found.length === 1 && found[0].mimeType === 'application/pdf';

        if (isNativePdf) {
          const bytes = new Uint8Array(await found[0].blob.arrayBuffer());
          if (cancelled) return;
          setPageDataForPreset({ images: [], nativePdfBytes: bytes });
          setPagesReady(true);

          const { ocrBoxes: boxes, pageComplexity: complexity } = await runOcrPipeline(bytes);
          if (cancelled) return;
          setOcrBoxes(boxes);
          setPageComplexity(complexity);
          setStage({ kind: 'ready', firstPage: null, isNativePdf: true });
          return;
        }

        const images = found.map((b) => b.blob);
        setPageDataForPreset({ images, nativePdfBytes: null });
        setPagesReady(true);

        const highQualityPages: PdfPage[] = await Promise.all(images.map((blob) => blobToPdfPage(blob, COMPRESSION_PRESETS.high)));
        const reviewPdf = await buildReceiptPdf(highQualityPages);
        const bytes = new Uint8Array(await reviewPdf.arrayBuffer());
        if (cancelled) return;

        const { ocrBoxes: boxes, pageComplexity: complexity } = await runOcrPipeline(bytes);
        if (cancelled) return;
        setOcrBoxes(boxes);
        setPageComplexity(complexity);
        setStage({
          kind: 'ready',
          firstPage: { url: highQualityPages[0].dataUrl, width: highQualityPages[0].width, height: highQualityPages[0].height },
          isNativePdf: false,
        });
      } catch (err) {
        if (!cancelled) setStage({ kind: 'error', message: err instanceof Error ? err.message : 'OCR processing failed.' });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  // Re-estimate the compressed file size whenever the chosen preset changes (images only).
  useEffect(() => {
    if (pageDataForPreset.nativePdfBytes || pageDataForPreset.images.length === 0) return;
    let cancelled = false;
    setEstimating(true);
    (async () => {
      const pages = await Promise.all(pageDataForPreset.images.map((blob) => blobToPdfPage(blob, COMPRESSION_PRESETS[preset])));
      const pdf = await buildReceiptPdf(pages);
      if (!cancelled) {
        setPresetSize(pdf.size);
        setEstimating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, pageDataForPreset]);

  const finalize = async (skipOcr: boolean) => {
    if (!receipt || !pagesReady) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      let finalPdf: Blob;
      if (pageDataForPreset.nativePdfBytes) {
        finalPdf = new Blob([pageDataForPreset.nativePdfBytes.slice().buffer], { type: 'application/pdf' });
      } else {
        const pages = await Promise.all(pageDataForPreset.images.map((blob) => blobToPdfPage(blob, COMPRESSION_PRESETS[preset])));
        finalPdf = await buildReceiptPdf(pages);
      }

      const pdfHash = await hashBlob(finalPdf);
      const finalBlobId = crypto.randomUUID();
      await putBlob({ id: finalBlobId, blob: finalPdf, mimeType: 'application/pdf', createdAt: new Date().toISOString() });

      // Discard the original uncompressed captures now that the final document is built.
      for (const ref of receipt.pageBlobRefs) {
        if (ref !== finalBlobId) await deleteBlob(ref);
      }

      const usedOcr = !skipOcr;
      const appliedMatches = usedOcr ? matches : {};
      const lineItems = receipt.lineItems.slice();
      if (lineItems.length > 0) {
        lineItems[0] = {
          ...lineItems[0],
          amountExTax: lineItems[0].amountExTax ?? appliedMatches.amountExTax?.value,
          amountIncTax: lineItems[0].amountIncTax ?? appliedMatches.amountIncTax?.value,
        };
      }

      await saveReceipt({
        ...receipt,
        pdfBlobRef: finalBlobId,
        pageBlobRefs: [finalBlobId],
        ocrBoxes: usedOcr ? ocrBoxes : undefined,
        receiptNumber: receipt.receiptNumber ?? appliedMatches.receiptNumber?.value,
        lineItems,
        pdfHash,
        updatedAt: new Date().toISOString(),
      });
      navigate(`/receipts/${receipt.id}`);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : 'Could not save this receipt. Please try again.');
    } finally {
      setFinalizing(false);
    }
  };

  if (!receipt) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-gray-600 dark:text-gray-400">Receipt not found.</p>
      </div>
    );
  }

  if (stage.kind === 'loading') {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="text-xl font-bold text-graphite dark:text-stone">Processing Receipt…</h1>
        <Panel className="p-6 text-center text-gray-600 dark:text-gray-400">
          <p>Running OCR and preparing the compressed document. This can take a moment.</p>
        </Panel>
        {finalizeError && <p className="text-sm text-rust">{finalizeError}</p>}
        <div className="flex justify-end">
          <Button variant="ghost" disabled={finalizing || !pagesReady} onClick={() => finalize(true)}>
            {pagesReady ? 'Skip OCR & Continue' : 'Loading pages…'}
          </Button>
        </div>
      </div>
    );
  }

  if (stage.kind === 'error') {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="text-xl font-bold text-graphite dark:text-stone">Processing Receipt</h1>
        <Panel className="p-6 space-y-3">
          <p className="text-rust text-sm">OCR processing failed: {stage.message}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You can still continue — every field remains manually editable on the next screen.
          </p>
        </Panel>
        {finalizeError && <p className="text-sm text-rust">{finalizeError}</p>}
        <div className="flex justify-end">
          <Button variant="primary" disabled={finalizing || !pagesReady} onClick={() => finalize(true)}>
            {finalizing ? 'Saving…' : 'Continue Without OCR'}
          </Button>
        </div>
      </div>
    );
  }

  const scaledBoxStyle = (box: OcrBox) => {
    if (!stage.firstPage) return {};
    const [x1, y1, x2, y2] = box.bbox;
    return {
      left: `${(x1 / stage.firstPage.width) * 100}%`,
      top: `${(y1 / stage.firstPage.height) * 100}%`,
      width: `${((x2 - x1) / stage.firstPage.width) * 100}%`,
      height: `${((y2 - y1) / stage.firstPage.height) * 100}%`,
    };
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-bold text-graphite dark:text-stone">Review Receipt</h1>

      {stage.firstPage && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold text-graphite dark:text-stone mb-2">Source &amp; Detected Fields</h2>
          <div
            className={`relative w-full overflow-hidden rounded border border-graphite/20 dark:border-white/20 transition-transform duration-300 ${zoomBox ? 'scale-150' : ''}`}
            style={
              zoomBox
                ? {
                    transformOrigin: `${((zoomBox.bbox[0] + zoomBox.bbox[2]) / 2 / stage.firstPage.width) * 100}% ${
                      ((zoomBox.bbox[1] + zoomBox.bbox[3]) / 2 / stage.firstPage.height) * 100
                    }%`,
                  }
                : undefined
            }
          >
            <img src={stage.firstPage.url} alt="First page of the receipt" className="w-full h-auto block" />
            {matches.amountIncTax && (
              <div className="absolute border-2 border-verdigris" style={scaledBoxStyle(matches.amountIncTax.box)} />
            )}
            {matches.amountExTax && <div className="absolute border-2 border-signal" style={scaledBoxStyle(matches.amountExTax.box)} />}
          </div>
          {(matches.amountIncTax || matches.amountExTax) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setZoomBox(zoomBox ? null : matches.amountIncTax?.box ?? matches.amountExTax?.box ?? null)}
            >
              {zoomBox ? 'Zoom Out' : 'Zoom to Total'}
            </Button>
          )}
        </Panel>
      )}

      <Panel className="p-4 space-y-2">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">Detected Amounts</h2>
        {pageComplexity.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            OCR ran on {pageComplexity.filter((p) => p.needsOcr).length} of {pageComplexity.length}{' '}
            {pageComplexity.length === 1 ? 'page' : 'pages'}
            {pageComplexity.some((p) => !p.needsOcr) ? ' — the rest already had a readable text layer.' : '.'}
          </p>
        )}
        {matches.amountIncTax ? (
          <p className="text-sm text-graphite dark:text-stone">
            Total (inc. tax): <span className="font-mono tabular-nums font-semibold">{matches.amountIncTax.value.toFixed(2)}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No total detected — enter it manually on the next screen.</p>
        )}
        {matches.amountExTax && (
          <p className="text-sm text-graphite dark:text-stone">
            Amount (ex. tax): <span className="font-mono tabular-nums font-semibold">{matches.amountExTax.value.toFixed(2)}</span>
          </p>
        )}
        {matches.receiptNumber && (
          <p className="text-sm text-graphite dark:text-stone">Receipt number: <span className="font-mono">{matches.receiptNumber.value}</span></p>
        )}
        {ocrBoxes.length > 0 && (
          <details className="text-xs text-gray-600 dark:text-gray-400">
            <summary className="cursor-pointer">Show all {ocrBoxes.length} OCR'd lines</summary>
            <ul className="mt-1 space-y-0.5">
              {ocrBoxes.map((box, i) => (
                <li key={i}>{box.text}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {!stage.isNativePdf && (
        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-graphite dark:text-stone">Compression</h2>
          <div className="flex gap-2">
            {(Object.keys(COMPRESSION_PRESETS) as CompressionPreset[]).map((p) => (
              <Button key={p} size="sm" variant={preset === p ? 'primary' : 'secondary'} onClick={() => setPreset(p)}>
                {COMPRESSION_PRESET_LABELS[p]}
              </Button>
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Estimated size: {estimating || presetSize == null ? 'Estimating…' : `${(presetSize / 1024).toFixed(0)} KB`}
          </p>
        </Panel>
      )}

      {finalizeError && <p className="text-sm text-rust">{finalizeError}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={finalizing} onClick={() => finalize(true)}>
          Skip OCR
        </Button>
        <Button variant="primary" disabled={finalizing} onClick={() => finalize(false)}>
          {finalizing ? 'Saving…' : 'Continue to Details'}
        </Button>
      </div>
    </div>
  );
};
