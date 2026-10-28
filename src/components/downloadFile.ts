/** Some browsers cancel a download whose URL is revoked too soon, so the URL lives this long. */
const REVOKE_DELAY_MS = 30_000;

/** Hands `data` to the browser as a file download named `fileName`. */
export function downloadFile(fileName: string, data: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([data.slice()], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}
