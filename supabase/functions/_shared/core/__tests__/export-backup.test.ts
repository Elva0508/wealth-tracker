import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, crc32, itemsExportTable, toCsv, toXlsx, validateBackup } from '../index.ts';
import { item, rates } from './helpers.ts';

describe('匯出', () => {
  const items = [
    item('cash_bank', '1000', { currency: 'USD', name: '美元帳戶', notes: '含 "引號", 逗號' }),
    item('loan', '50000', { name: '信貸' }),
    item('other_asset', '20000', { name: '舊車', status: 'archived' }),
  ];

  it('規格案例 14：包含所有項目與欄位，不受隱藏金額影響', () => {
    const table = itemsExportTable(items, rates({ USD: '32' }));
    expect(table.header).toEqual(['類型', '分類', '名稱', '幣別', '原幣金額', '匯率', 'TWD 估值', '狀態', '備註']);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toEqual([
      '資產',
      '現金與銀行存款',
      '美元帳戶',
      'USD',
      { number: '1000.0000' },
      { number: '32.000000' },
      { number: '32000.00' },
      '使用中',
      '含 "引號", 逗號',
    ]);
    expect(table.rows[2][7]).toBe('已封存');
  });

  it('CSV 有 BOM，並正確處理逗號與引號', () => {
    const csv = toCsv(itemsExportTable(items, rates({ USD: '32' })));
    expect(csv.startsWith('﻿類型,分類')).toBe(true);
    expect(csv).toContain('"含 ""引號"", 逗號"');
  });

  it('缺少匯率時標示「無匯率」，估值留空', () => {
    const table = itemsExportTable([item('cash_bank', '5', { currency: 'CHF' })], rates({}));
    expect(table.rows[0][5]).toBe('無匯率');
    expect(table.rows[0][6]).toBeNull();
  });

  it('xlsx 是合法的 zip 檔', () => {
    const bytes = toXlsx(itemsExportTable(items, rates({ USD: '32' })));
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('備份檢查', () => {
  const valid = () => ({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: '2026-10-19T10:00:00Z',
    data: {
      settings: { base_currency: 'TWD', hide_amounts: true, cost_method: 'weighted_average' },
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'asset',
          category: 'cash_bank',
          name: '薪轉',
          currency: 'TWD',
          amount: '100000',
          notes: null,
          source_type: 'manual',
          status: 'active',
          archived_at: null,
          converted_to_id: null,
          sort_order: 0,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
      ],
      itemChanges: [],
      snapshots: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          snapshot_date: '2026-10-18',
          total_assets: '100000',
          total_liabilities: '0',
          net_worth: '100000',
          fx_status: 'fresh',
          created_at: '2026-10-18T22:00:00Z',
        },
      ],
      snapshotLines: [
        {
          snapshot_id: '22222222-2222-4222-8222-222222222222',
          item_id: '11111111-1111-4111-8111-111111111111',
          category: 'cash_bank',
          currency: 'TWD',
          amount: '100000',
          fx_rate: '1',
          amount_base: '100000',
        },
      ],
    },
  });

  it('合法的備份產生預覽', () => {
    const result = validateBackup(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview).toMatchObject({
        itemCount: 1,
        activeItemCount: 1,
        snapshotCount: 1,
        firstSnapshotDate: '2026-10-18',
        lastSnapshotDate: '2026-10-18',
      });
    }
  });

  it('不是備份檔或版本太新時拒絕', () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup({ ...valid(), version: 99 }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
  });

  it('資料有錯時列出原因', () => {
    const bad = valid();
    bad.data.items[0].amount = '-1';
    bad.data.items[0].category = 'crypto';
    bad.data.snapshotLines[0].snapshot_id = '33333333-3333-4333-8333-333333333333';
    const result = validateBackup(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBe(3);
  });
});
