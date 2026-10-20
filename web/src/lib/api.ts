/**
 * 所有資料庫存取集中在這裡。
 *
 * - 權限由資料庫的 RLS 處理，這裡不需要也不應該帶 user_id 過濾
 * - numeric 欄位一律用 ::text 讀取，避免 JavaScript 數字精度問題
 */
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type BalanceItem,
  type Category,
  type FxRow,
  type ItemKind,
  type LoanAdjustment,
  type LoanAdjustmentRow,
  type LoanModeRow,
  type LoanRateRow,
  type LoanRow,
  type ModeChange,
  type ValidItemInput,
  type ValidLoanInput,
  kindOf,
} from '@core';
import { supabase } from './supabase';

export interface Item extends BalanceItem {
  notes: string | null;
  sourceType: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  baseCurrency: string;
  hideAmounts: boolean;
  costMethod: string;
}

const ITEM_COLUMNS =
  'id, kind, category, name, currency, amount:amount::text, notes, status, source_type, sort_order, archived_at, converted_to_id, created_at, updated_at';

interface ItemRow {
  id: string;
  kind: ItemKind;
  category: Category;
  name: string;
  currency: string;
  amount: string;
  notes: string | null;
  status: 'active' | 'archived';
  source_type: string;
  sort_order: number;
  archived_at: string | null;
  converted_to_id: string | null;
  created_at: string;
  updated_at: string;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    name: row.name,
    currency: row.currency.trim(),
    amount: row.amount,
    status: row.status,
    notes: row.notes,
    sourceType: row.source_type,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** PostgREST 預設一次最多回傳 1000 筆，資料多時分頁讀完 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const data = check(await page(from, from + size - 1)) as T[];
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

// ---------- 項目 ----------

/** 讀取所有項目（含已封存） */
export async function fetchItems(): Promise<Item[]> {
  const rows = await fetchAll<ItemRow>((from, to) =>
    supabase.from('balance_items').select(ITEM_COLUMNS).order('sort_order').order('created_at').range(from, to),
  );
  return rows.map(toItem);
}

export async function createItem(input: ValidItemInput, sortOrder: number): Promise<Item> {
  const row = check(
    await supabase
      .from('balance_items')
      .insert({
        kind: kindOf(input.category),
        category: input.category,
        name: input.name,
        currency: input.currency,
        amount: input.amount,
        notes: input.notes,
        sort_order: sortOrder,
      })
      .select(ITEM_COLUMNS)
      .single(),
  );
  return toItem(row as unknown as ItemRow);
}

export async function updateItem(id: string, input: ValidItemInput): Promise<Item> {
  const row = check(
    await supabase
      .from('balance_items')
      .update({
        kind: kindOf(input.category),
        category: input.category,
        name: input.name,
        currency: input.currency,
        amount: input.amount,
        notes: input.notes,
      })
      .eq('id', id)
      .select(ITEM_COLUMNS)
      .single(),
  );
  return toItem(row as unknown as ItemRow);
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  check(
    await supabase
      .from('balance_items')
      .update(
        archived
          ? { status: 'archived', archived_at: new Date().toISOString() }
          : { status: 'active', archived_at: null },
      )
      .eq('id', id),
  );
}

/** 貸款項目的金額由還款表算出；和資料庫不同時寫回，讓備份、匯出與修改紀錄也一致 */
export async function syncItemAmount(id: string, amount: string): Promise<void> {
  check(await supabase.from('balance_items').update({ amount }).eq('id', id));
}

// ---------- 貸款 ----------

export interface LoanData {
  loans: LoanRow[];
  rates: (LoanRateRow & { id: string })[];
  modes: (LoanModeRow & { id: string })[];
  adjustments: (LoanAdjustmentRow & { id: string })[];
}

export async function fetchLoans(): Promise<LoanData> {
  const [loans, rates, modes, adjustments] = await Promise.all([
    fetchAll<LoanRow>((from, to) =>
      supabase
        .from('loans')
        .select('id, item_id, start_date, principal:principal::text, first_payment_date')
        .order('created_at')
        .range(from, to),
    ),
    fetchAll<LoanData['rates'][number]>((from, to) =>
      supabase
        .from('loan_rate_changes')
        .select('id, loan_id, effective_date, annual_rate:annual_rate::text')
        .order('effective_date')
        .range(from, to),
    ),
    fetchAll<LoanData['modes'][number]>((from, to) =>
      supabase
        .from('loan_mode_changes')
        .select('id, loan_id, effective_date, mode, term_months, interest_every')
        .order('effective_date')
        .range(from, to),
    ),
    fetchAll<LoanData['adjustments'][number]>((from, to) =>
      supabase
        .from('loan_adjustments')
        .select('id, loan_id, adjust_date, kind, amount:amount::text, keep, note')
        .order('adjust_date')
        .range(from, to),
    ),
  ]);
  return { loans, rates, modes, adjustments };
}

/** 新增貸款；itemId 有給時是把原本手動輸入的貸款項目轉成自動計算 */
export async function createLoan(
  input: ValidLoanInput,
  options: { currency: string; itemId?: string; sortOrder?: number },
): Promise<string> {
  return check(
    await supabase.rpc('create_loan', {
      p_name: input.name,
      p_currency: options.currency,
      p_start_date: input.startDate,
      p_principal: input.principal,
      p_first_payment_date: input.firstPaymentDate,
      p_annual_rate: input.annualRate,
      p_mode: input.mode.mode,
      p_term_months: input.mode.termMonths,
      p_interest_every: input.mode.interestEvery,
      p_item_id: options.itemId ?? null,
      p_sort_order: options.sortOrder ?? 0,
    }),
  ) as string;
}

/** 切換還款方式；同一天已經有一筆時直接取代 */
export async function saveModeChange(loanId: string, change: ModeChange): Promise<void> {
  check(
    await supabase.from('loan_mode_changes').upsert(
      {
        loan_id: loanId,
        effective_date: change.effectiveDate,
        mode: change.mode,
        term_months: change.termMonths,
        interest_every: change.interestEvery,
      },
      { onConflict: 'loan_id,effective_date' },
    ),
  );
}

/** 記錄利率變動；同一天已經有一筆時直接取代 */
export async function saveRateChange(loanId: string, effectiveDate: string, annualRate: string): Promise<void> {
  check(
    await supabase
      .from('loan_rate_changes')
      .upsert(
        { loan_id: loanId, effective_date: effectiveDate, annual_rate: annualRate },
        { onConflict: 'loan_id,effective_date' },
      ),
  );
}

export async function addAdjustment(loanId: string, adjustment: LoanAdjustment): Promise<void> {
  check(
    await supabase.from('loan_adjustments').insert({
      loan_id: loanId,
      adjust_date: adjustment.date,
      kind: adjustment.kind,
      amount: adjustment.amount,
      keep: adjustment.keep,
    }),
  );
}

export type LoanRecordTable = 'loan_rate_changes' | 'loan_mode_changes' | 'loan_adjustments';

export async function deleteLoanRecord(table: LoanRecordTable, id: string): Promise<void> {
  check(await supabase.from(table).delete().eq('id', id));
}

// ---------- 淨資產趨勢 ----------

export interface SnapshotPoint {
  date: string;
  netWorth: string;
  totalAssets: string;
  totalLiabilities: string;
}

export async function fetchSnapshots(): Promise<SnapshotPoint[]> {
  const rows = await fetchAll<{
    snapshot_date: string;
    net_worth: string;
    total_assets: string;
    total_liabilities: string;
  }>((from, to) =>
    supabase
      .from('net_worth_snapshots')
      .select(
        'snapshot_date, net_worth:net_worth::text, total_assets:total_assets::text, total_liabilities:total_liabilities::text',
      )
      .order('snapshot_date')
      .range(from, to),
  );
  return rows.map((r) => ({
    date: r.snapshot_date,
    netWorth: r.net_worth,
    totalAssets: r.total_assets,
    totalLiabilities: r.total_liabilities,
  }));
}

// ---------- 匯率 ----------

export async function fetchRates(): Promise<FxRow[]> {
  return check(
    await supabase.from('fx_latest').select('currency, mid_rate:mid_rate::text, source, rate_date, fetched_at'),
  ) as unknown as FxRow[];
}

/** 請後端更新匯率；後端一小時內更新過會直接略過 */
export async function requestFxRefresh(): Promise<void> {
  const { error } = await supabase.functions.invoke('fetch-fx', { method: 'POST' });
  if (error) throw new Error(error.message);
}

// ---------- 設定 ----------

export async function fetchSettings(): Promise<Settings> {
  const row = check(
    await supabase.from('user_settings').select('base_currency, hide_amounts, cost_method').maybeSingle(),
  ) as { base_currency: string; hide_amounts: boolean; cost_method: string } | null;
  return {
    baseCurrency: row?.base_currency ?? 'TWD',
    hideAmounts: row?.hide_amounts ?? true,
    costMethod: row?.cost_method ?? 'weighted_average',
  };
}

export async function updateHideAmounts(hide: boolean): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('尚未登入');
  check(await supabase.from('user_settings').update({ hide_amounts: hide }).eq('user_id', data.user.id));
}

// ---------- 備份與還原 ----------

export async function buildBackup(): Promise<BackupFile> {
  const [
    items,
    itemChanges,
    snapshots,
    snapshotLines,
    settingsRow,
    fxRates,
    loans,
    loanRateChanges,
    loanModeChanges,
    loanAdjustments,
  ] = await Promise.all([
    fetchAll<BackupFile['data']['items'][number]>((from, to) =>
      supabase.from('balance_items').select(ITEM_COLUMNS).order('created_at').range(from, to),
    ),
    fetchAll<BackupFile['data']['itemChanges'][number]>((from, to) =>
      supabase
        .from('balance_item_changes')
        .select('id, item_id, field, old_value, new_value, changed_at')
        .order('changed_at')
        .range(from, to),
    ),
    fetchAll<BackupFile['data']['snapshots'][number]>((from, to) =>
      supabase
        .from('net_worth_snapshots')
        .select(
          'id, snapshot_date, total_assets:total_assets::text, total_liabilities:total_liabilities::text, net_worth:net_worth::text, fx_status, created_at',
        )
        .order('snapshot_date')
        .range(from, to),
    ),
    fetchAll<BackupFile['data']['snapshotLines'][number]>((from, to) =>
      supabase
        .from('snapshot_lines')
        .select(
          'snapshot_id, item_id, category, currency, amount:amount::text, fx_rate:fx_rate::text, amount_base:amount_base::text',
        )
        .order('snapshot_id')
        .order('item_id')
        .range(from, to),
    ),
    supabase.from('user_settings').select('base_currency, hide_amounts, cost_method').maybeSingle(),
    fetchAll<unknown>((from, to) =>
      supabase
        .from('fx_rates')
        .select('currency, quote_currency, rate_date, mid_rate:mid_rate::text, source, fetched_at')
        .order('rate_date')
        .order('currency')
        .range(from, to),
    ),
    fetchAll<NonNullable<BackupFile['data']['loans']>[number]>((from, to) =>
      supabase
        .from('loans')
        .select('id, item_id, start_date, principal:principal::text, first_payment_date, created_at, updated_at')
        .order('created_at')
        .range(from, to),
    ),
    fetchAll<NonNullable<BackupFile['data']['loanRateChanges']>[number]>((from, to) =>
      supabase
        .from('loan_rate_changes')
        .select('id, loan_id, effective_date, annual_rate:annual_rate::text, created_at')
        .order('effective_date')
        .range(from, to),
    ),
    fetchAll<NonNullable<BackupFile['data']['loanModeChanges']>[number]>((from, to) =>
      supabase
        .from('loan_mode_changes')
        .select('id, loan_id, effective_date, mode, term_months, interest_every, created_at')
        .order('effective_date')
        .range(from, to),
    ),
    fetchAll<NonNullable<BackupFile['data']['loanAdjustments']>[number]>((from, to) =>
      supabase
        .from('loan_adjustments')
        .select('id, loan_id, adjust_date, kind, amount:amount::text, keep, note, created_at')
        .order('adjust_date')
        .range(from, to),
    ),
  ]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: check(settingsRow),
      items,
      itemChanges,
      snapshots,
      snapshotLines,
      loans,
      loanRateChanges,
      loanModeChanges,
      loanAdjustments,
      fxRates,
    },
  };
}

export async function restoreBackup(backup: BackupFile): Promise<{ items: number; snapshots: number; loans: number }> {
  return check(await supabase.rpc('restore_backup', { p_backup: backup })) as {
    items: number;
    snapshots: number;
    loans: number;
  };
}
