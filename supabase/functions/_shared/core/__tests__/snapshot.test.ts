import { describe, expect, it } from 'vitest';
import { addDays, buildSnapshot, snapshotDateFor, taipeiDate } from '../index.ts';
import { item, rates } from './helpers.ts';

describe('快照日期', () => {
  it('台灣時間 10/20 06:00 執行 → 快照日期 10/19', () => {
    // 台灣 06:00 = UTC 前一天 22:00
    expect(snapshotDateFor(new Date('2026-10-19T22:00:00Z'))).toBe('2026-10-19');
  });

  it('跨月與跨年', () => {
    expect(snapshotDateFor(new Date('2026-10-31T22:00:00Z'))).toBe('2026-10-31');
    expect(snapshotDateFor(new Date('2026-12-31T22:00:00Z'))).toBe('2026-12-31');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('台灣日期換算', () => {
    expect(taipeiDate(new Date('2026-10-19T15:59:00Z'))).toBe('2026-10-19');
    expect(taipeiDate(new Date('2026-10-19T16:00:00Z'))).toBe('2026-10-20');
  });
});

describe('建立快照', () => {
  const runAt = new Date('2026-10-19T22:00:00Z');

  it('只包含啟用中的項目，總額與明細一致', () => {
    const usd = item('bank', '1000', { currency: 'USD' });
    const snap = buildSnapshot(
      [item('bank', '100000'), usd, item('loan', '50000'), item('bank', '999', { status: 'archived' })],
      rates({ USD: '32' }, { fetchedAt: '2026-10-19T21:50:00Z' }),
      runAt,
    );
    expect(snap.snapshotDate).toBe('2026-10-19');
    expect(snap.totalAssets).toBe('132000.0000');
    expect(snap.totalLiabilities).toBe('50000.0000');
    expect(snap.netWorth).toBe('82000.0000');
    expect(snap.fxStatus).toBe('fresh');
    expect(snap.lines).toHaveLength(3);
    const line = snap.lines.find((l) => l.itemId === usd.id)!;
    expect(line).toMatchObject({ currency: 'USD', amount: '1000.0000', fxRate: '32.000000', amountBase: '32000.0000' });
  });

  it('規格案例 11：快照是當下的複本，之後改金額不影響已建立的快照', () => {
    const cash = item('bank', '100000');
    const items = [cash];
    const first = buildSnapshot(items, rates({}), runAt);
    cash.amount = '200000';
    expect(first.totalAssets).toBe('100000.0000');
    expect(buildSnapshot(items, rates({}), runAt).totalAssets).toBe('200000.0000');
  });

  it('缺少匯率的項目保留明細但不計入總額，狀態標示 missing', () => {
    const snap = buildSnapshot([item('bank', '500', { currency: 'CHF' })], rates({}), runAt);
    expect(snap.totalAssets).toBe('0.0000');
    expect(snap.fxStatus).toBe('missing');
    expect(snap.lines[0]).toMatchObject({ fxRate: null, amountBase: null });
  });
});
