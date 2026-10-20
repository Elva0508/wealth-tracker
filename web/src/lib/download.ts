/** 在瀏覽器觸發檔案下載 */
export function downloadFile(content: string | Uint8Array, fileName: string, mimeType: string): void {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 檔名用的時間戳，例如 20261019-1830（台灣時間） */
export function fileStamp(at = new Date()): string {
  const t = new Date(at.getTime() + 8 * 3600_000).toISOString();
  return `${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11, 16).replace(':', '')}`;
}
