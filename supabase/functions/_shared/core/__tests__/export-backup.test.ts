import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, crc32, itemsExportTable, toCsv, toXlsx, validateBackup } from '../index.ts';
import { item, rates } from './helpers.ts';

describe('匯出', () => {
  const items = [
    item('bank', '1000', { currency: 'USD', name: '美元帳戶', notes: '含 "引號", 逗號' }),
    item('loan', '50000', { name: '信貸', subtype: 'personal' }),
    item('fixed_other', '20000', { name: '舊車', status: 'archived' }),
  ];

  it('規格案例 14：包含所有項目與欄位，不受隱藏金額影響', () => {
    const table = itemsExportTable(items, rates({ USD: '32' }));
    expect(table.header).toEqual([
      '類型',
      '大類',
      '分類',
      '細項',
      '名稱',
      '幣別',
      '原幣金額',
      '匯率',
      'TWD 估值',
      '狀態',
      '備註',
    ]);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toEqual([
      '資產',
      '流動資金',
      '銀行帳戶',
      '',
      '美元帳戶',
      'USD',
      { number: '1000.0000' },
      { number: '32.000000' },
      { number: '32000.00' },
      '使用中',
      '含 "引號", 逗號',
    ]);
    expect(table.rows[1].slice(0, 4)).toEqual(['負債', '負債', '貸款', '信用貸款']);
    expect(table.rows[2][9]).toBe('已封存');
  });

  it('CSV 有 BOM，並正確處理逗號與引號', () => {
    const csv = toCsv(itemsExportTable(items, rates({ USD: '32' })));
    expect(csv.startsWith('﻿類型,大類,分類,細項')).toBe(true);
    expect(csv).toContain('"含 ""引號"", 逗號"');
  });

  it('缺少匯率時標示「無匯率」，估值留空', () => {
    const table = itemsExportTable([item('bank', '5', { currency: 'CHF' })], rates({}));
    expect(table.rows[0][7]).toBe('無匯率');
    expect(table.rows[0][8]).toBeNull();
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
          category: 'bank',
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
          category: 'bank',
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
    bad.data.items[0].category = 'spaceship';
    bad.data.snapshotLines[0].snapshot_id = '33333333-3333-4333-8333-333333333333';
    const result = validateBackup(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBe(3);
  });

  const withLoan = () => {
    const b = valid() as ReturnType<typeof valid> & { data: Record<string, unknown> };
    const loanId = '44444444-4444-4444-8444-444444444444';
    b.version = 2;
    b.data.loans = [
      {
        id: loanId,
        item_id: '11111111-1111-4111-8111-111111111111',
        start_date: '2026-01-15',
        principal: '1000000',
        first_payment_date: '2026-02-15',
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      },
    ];
    b.data.loanRateChanges = [
      {
        id: 'r',
        loan_id: loanId,
        effective_date: '2026-01-15',
        annual_rate: '2.185',
        created_at: '2026-01-15T00:00:00Z',
      },
    ];
    b.data.loanModeChanges = [
      {
        id: 'm',
        loan_id: loanId,
        effective_date: '2026-01-15',
        mode: 'annuity',
        term_months: 240,
        interest_every: null,
        created_at: '2026-01-15T00:00:00Z',
      },
    ];
    b.data.loanAdjustments = [];
    return b;
  };

  it('版本 2：貸款資料通過檢查並列入預覽；版本 1 視為沒有貸款', () => {
    const v2 = validateBackup(withLoan());
    expect(v2.ok && v2.preview.loanCount).toBe(1);
    const v1 = validateBackup(valid());
    expect(v1.ok && v1.preview.loanCount).toBe(0);
  });

  it('貸款資料對不上時拒絕', () => {
    const bad = withLoan();
    (bad.data.loans as { item_id: string }[])[0].item_id = '99999999-9999-4999-8999-999999999999';
    (bad.data.loanModeChanges as { mode: string }[])[0].mode = 'magic';
    const result = validateBackup(bad);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toEqual(['第 1 筆貸款：找不到對應的項目', '第 1 筆還款方式紀錄：資料格式錯誤']);
  });

  it('舊版備份的分類代碼換成新分類', () => {
    const old = valid();
    old.data.items[0].category = 'cash_bank';
    old.data.snapshotLines[0].category = 'cash_bank';
    const result = validateBackup(old);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.data.items[0].category).toBe('bank');
      expect(result.backup.data.snapshotLines[0].category).toBe('bank');
    }
  });
});
