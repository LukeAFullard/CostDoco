/** Triggers a browser download of `blob` named `filename`, without navigating away. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Some engines (e.g. Safari) haven't necessarily started reading the blob:
  // URL by the time click() returns synchronously — revoking it immediately
  // can abort the download. Defer past that window instead.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
