/**
 * 每日快照。只接受排程呼叫（台灣時間每天 06:00）。
 *
 * 對每位有資料的使用者：
 * 1. 讀取所有項目與目前要使用的匯率
 * 2. 用共用計算模組 buildSnapshot() 算出總額與明細
 * 3. 呼叫資料庫函式 save_snapshot() 寫入；同一天重跑會覆蓋，不會產生第二筆
 *
 * 某位使用者失敗時記錄錯誤並繼續處理下一位；不補造過去日期的快照。
 */
import {
  type BalanceItem,
  type FxRow,
  buildSnapshot,
  rateTableFromRows,
} from '../_shared/core/index.ts';
import { corsHeaders, identifyCaller, json, serviceClient } from '../_shared/auth.ts';

const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await identifyCaller(req);
  if (caller.type !== 'cron') return json({ error: 'unauthorized' }, 401);

  const db = serviceClient();
  const runAt = new Date();

  const { data: fxRows, error: fxError } = await db
    .from('fx_latest')
    .select('currency, mid_rate:mid_rate::text, source, rate_date, fetched_at');
  if (fxError) return json({ ok: false, error: fxError.message }, 500);
  const rates = rateTableFromRows((fxRows ?? []) as FxRow[]);

  // 分頁讀取所有項目，再依使用者分組
  const itemsByUser = new Map<string, BalanceItem[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('balance_items')
      .select('id, user_id, kind, category, name, currency, amount:amount::text, status')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return json({ ok: false, error: error.message }, 500);
    for (const row of data ?? []) {
      const list = itemsByUser.get(row.user_id) ?? [];
      list.push(row as unknown as BalanceItem);
      itemsByUser.set(row.user_id, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  let saved = 0;
  const failures: { userId: string; error: string }[] = [];
  for (const [userId, items] of itemsByUser) {
    try {
      const snap = buildSnapshot(items, rates, runAt);
      const { error } = await db.rpc('save_snapshot', {
        p_user_id: userId,
        p_snapshot_date: snap.snapshotDate,
        p_total_assets: snap.totalAssets,
        p_total_liabilities: snap.totalLiabilities,
        p_net_worth: snap.netWorth,
        p_fx_status: snap.fxStatus,
        p_lines: snap.lines.map((l) => ({
          item_id: l.itemId,
          category: l.category,
          currency: l.currency,
          amount: l.amount,
          fx_rate: l.fxRate,
          amount_base: l.amountBase,
        })),
      });
      if (error) throw new Error(error.message);
      saved += 1;
    } catch (error) {
      failures.push({ userId, error: String(error) });
      console.error(`使用者 ${userId} 快照失敗`, error);
    }
  }

  return json({ ok: failures.length === 0, saved, failed: failures.length, failures }, failures.length ? 500 : 200);
});
