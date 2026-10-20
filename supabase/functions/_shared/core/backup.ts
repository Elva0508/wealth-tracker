/**
 * 完整備份檔的格式與檢查。
 *
 * 備份是一個 JSON 檔，包含使用者的所有資料（含已封存項目、快照、修改紀錄）。
 * 匯率是所有人共用的公開資料，備份會一起帶出來方便查閱，但還原時不會寫回。
 * 還原會「覆蓋」目前資料，所以檔案一定要先通過這裡的檢查，再顯示預覽讓使用者確認。
 */
import { isDecimalString } from './decimal.ts';
import { isCategory } from './balance.ts';

export const BACKUP_FORMAT = 'personal-wealth-tracker-backup';
export const BACKUP_VERSION = 1;

export interface BackupItem {
  id: string;
  kind: 'asset' | 'liability';
  category: string;
  name: string;
  currency: string;
  amount: string;
  notes: string | null;
  source_type: string;
  status: 'active' | 'archived';
  archived_at: string | null;
  converted_to_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BackupSnapshot {
  id: string;
  snapshot_date: string;
  total_assets: string;
  total_liabilities: string;
  net_worth: string;
  fx_status: string;
  created_at: string;
}

export interface BackupSnapshotLine {
  snapshot_id: string;
  item_id: string;
  category: string;
  currency: string;
  amount: string;
  fx_rate: string | null;
  amount_base: string | null;
}

export interface BackupItemChange {
  id: string;
  item_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: {
    settings: { base_currency: string; hide_amounts: boolean; cost_method: string } | null;
    items: BackupItem[];
    itemChanges: BackupItemChange[];
    snapshots: BackupSnapshot[];
    snapshotLines: BackupSnapshotLine[];
    /** 僅供參考，還原時不寫回 */
    fxRates?: unknown[];
  };
}

export interface BackupPreview {
  exportedAt: string;
  itemCount: number;
  activeItemCount: number;
  snapshotCount: number;
  firstSnapshotDate: string | null;
  lastSnapshotDate: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Check = { ok: true; backup: BackupFile; preview: BackupPreview } | { ok: false; errors: string[] };

/** 檢查上傳的備份檔。最多列出 10 個錯誤，避免訊息太長。 */
export function validateBackup(input: unknown): Check {
  const errors: string[] = [];
  const fail = (message: string) => {
    if (errors.length < 10) errors.push(message);
  };

  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['檔案內容不是備份格式'] };
  const file = input as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) return { ok: false, errors: ['這不是本 App 的備份檔'] };
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    return { ok: false, errors: [`備份版本 ${String(file.version)} 不支援，請先更新 App`] };
  }
  const data = file.data;
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.snapshots) || !Array.isArray(data.snapshotLines)) {
    return { ok: false, errors: ['備份檔缺少必要的資料'] };
  }
  if (!Array.isArray(data.itemChanges)) data.itemChanges = [];

  const itemIds = new Set<string>();
  data.items.forEach((item, i) => {
    const at = `第 ${i + 1} 個項目`;
    if (!UUID_RE.test(String(item?.id))) fail(`${at}：id 格式錯誤`);
    else if (itemIds.has(item.id)) fail(`${at}：id 重複`);
    else itemIds.add(item.id);
    if (!isCategory(String(item?.category))) fail(`${at}：分類「${String(item?.category)}」不存在`);
    if (typeof item?.amount !== 'string' || !isDecimalString(item.amount) || item.amount.trim().startsWith('-')) {
      fail(`${at}：金額格式錯誤`);
    }
    if (!/^[A-Z]{3}$/.test(String(item?.currency))) fail(`${at}：幣別格式錯誤`);
    if (item?.status !== 'active' && item?.status !== 'archived') fail(`${at}：狀態錯誤`);
  });

  const snapshotIds = new Set<string>();
  const snapshotDates = new Set<string>();
  data.snapshots.forEach((s, i) => {
    const at = `第 ${i + 1} 筆快照`;
    if (!UUID_RE.test(String(s?.id))) fail(`${at}：id 格式錯誤`);
    else snapshotIds.add(s.id);
    if (!DATE_RE.test(String(s?.snapshot_date))) fail(`${at}：日期格式錯誤`);
    else if (snapshotDates.has(s.snapshot_date)) fail(`${at}：日期 ${s.snapshot_date} 重複`);
    else snapshotDates.add(s.snapshot_date);
    for (const key of ['total_assets', 'total_liabilities', 'net_worth'] as const) {
      if (typeof s?.[key] !== 'string' || !isDecimalString(s[key])) fail(`${at}：${key} 格式錯誤`);
    }
  });

  data.snapshotLines.forEach((line, i) => {
    if (!snapshotIds.has(String(line?.snapshot_id))) fail(`第 ${i + 1} 筆快照明細：找不到對應的快照`);
  });
  data.itemChanges.forEach((change, i) => {
    if (!itemIds.has(String(change?.item_id))) fail(`第 ${i + 1} 筆修改紀錄：找不到對應的項目`);
  });

  if (errors.length > 0) return { ok: false, errors };

  const dates = [...snapshotDates].sort();
  return {
    ok: true,
    backup: file as BackupFile,
    preview: {
      exportedAt: String(file.exportedAt ?? ''),
      itemCount: data.items.length,
      activeItemCount: data.items.filter((i) => i.status === 'active').length,
      snapshotCount: data.snapshots.length,
      firstSnapshotDate: dates[0] ?? null,
      lastSnapshotDate: dates.at(-1) ?? null,
    },
  };
}
