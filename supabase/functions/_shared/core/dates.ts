/**
 * 日期工具。台灣沒有日光節約時間，固定 UTC+8，所以直接用加 8 小時換算。
 * 日期一律用 'YYYY-MM-DD' 字串表示，避免時區造成的日期偏移。
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 某個時間點在台灣是哪一天 */
export function taipeiDate(at: Date): string {
  return new Date(at.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 日期加減天數 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function compactToIsoDate(compact: string): string | null {
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/**
 * 快照日期：排程在台灣時間早上 6 點執行，記錄的是「前一天」結束時的資產狀況。
 * 例如 2026-10-20 06:00（台灣）執行 → 快照日期 2026-10-19。
 */
export function snapshotDateFor(runAt: Date): string {
  return addDays(taipeiDate(runAt), -1);
}
