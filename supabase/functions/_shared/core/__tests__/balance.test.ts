import { describe, expect, it } from 'vitest';
import { balanceBars, dec, groupOf, kindOf, subtypeLabel, summarize, toFixedString } from '../index.ts';
import { item, rates } from './helpers.ts';

const noRates = rates({});
const twd = (value: bigint) => toFixedString(value, 0);

describe('總額計算', () => {
  it('規格案例 1：存款 100,000、信貸 50,000 → 淨資產 50,000', () => {
    const s = summarize([item('bank', '100000'), item('loan', '50000')], noRates);
    expect(twd(s.totalAssets)).toBe('100000');
    expect(twd(s.totalLiabilities)).toBe('50000');
    expect(twd(s.netWorth)).toBe('50000');
  });

  it('規格案例 2：美元存款 US$1,000、匯率 32 → 總資產增加 32,000', () => {
    const usd = item('bank', '1000', { currency: 'USD' });
    const s = summarize([item('bank', '100000'), usd], rates({ USD: '32' }));
    expect(twd(s.totalAssets)).toBe('132000');
    const valued = s.items.find((i) => i.id === usd.id)!;
    expect(toFixedString(valued.amountDec, 2)).toBe('1000.00');
    expect(twd(valued.amountBase!)).toBe('32000');
  });

  it('規格案例 3：匯率由 32 變 33，原幣金額不變、新台幣估值改變', () => {
    const usd = item('bank', '1000', { currency: 'USD' });
    const before = summarize([usd], rates({ USD: '32' }));
    const after = summarize([usd], rates({ USD: '33' }));
    expect(before.items[0].amount).toBe('1000');
    expect(after.items[0].amount).toBe('1000');
    expect(twd(after.totalAssets)).toBe('33000');
  });

  it('規格案例 5：找不到匯率時不能當成 0，改列入缺少匯率清單', () => {
    const s = summarize([item('bank', '1000'), item('bank', '500', { currency: 'CHF' })], noRates);
    expect(twd(s.totalAssets)).toBe('1000');
    expect(s.missingCurrencies).toEqual(['CHF']);
    expect(s.items.find((i) => i.currency === 'CHF')!.amountBase).toBeNull();
    expect(s.categories.bank.count).toBe(2);
  });

  it('規格案例 6：封存的項目不計入總額，恢復後總額回復', () => {
    const archived = item('bank', '20000', { status: 'archived' });
    const items = [item('bank', '100000'), archived];
    expect(twd(summarize(items, noRates).totalAssets)).toBe('100000');
    const restored = items.map((i) => (i.id === archived.id ? { ...i, status: 'active' as const } : i));
    expect(twd(summarize(restored, noRates).totalAssets)).toBe('120000');
  });

  it('分類小計', () => {
    const s = summarize(
      [item('bank', '30000'), item('stock', '60000'), item('real_estate', '10000'), item('liability_other', '5000')],
      noRates,
    );
    expect(twd(s.categories.bank.total)).toBe('30000');
    expect(twd(s.categories.stock.total)).toBe('60000');
    expect(twd(s.categories.liability_other.total)).toBe('5000');
    expect(twd(s.netWorth)).toBe('95000');
    expect(twd(s.groups.liquid.total)).toBe('30000');
    expect(twd(s.groups.fixed.total)).toBe('10000');
    expect(s.groups.liability.count).toBe(1);
  });

  it('大類決定是資產還是負債', () => {
    expect(groupOf('ewallet')).toBe('liquid');
    expect(groupOf('lending')).toBe('receivable');
    expect(kindOf('lending')).toBe('asset');
    expect(kindOf('credit_card')).toBe('liability');
    expect(subtypeLabel('loan', 'student')).toBe('學貸');
    expect(subtypeLabel('cash', 'student')).toBeNull();
  });
});

describe('平衡長條', () => {
  it('規格案例 7：資產 300,000、負債 100,000 → 負債段 1/3、淨資產段 2/3', () => {
    const bars = balanceBars(summarize([item('bank', '300000'), item('loan', '100000')], noRates));
    expect(bars.liabilityRow.map((s) => [s.kind, s.percent])).toEqual([
      ['liability', 33.33],
      ['net_worth', 66.67],
    ]);
    expect(bars.assetRow.map((s) => s.percent)).toEqual([100]);
    expect(bars.liabilityRatio).toBe(33.33);
  });

  it('規格案例 8：資產依大類分段 30% / 60% / 10%', () => {
    const bars = balanceBars(
      summarize(
        [item('bank', '20000'), item('cash', '10000'), item('stock', '60000'), item('real_estate', '10000')],
        noRates,
      ),
    );
    // 現金與銀行帳戶都屬於「流動資金」，合成一段
    expect(bars.assetRow.map((s) => [s.key, s.percent])).toEqual([
      ['liquid', 30],
      ['investment', 60],
      ['fixed', 10],
    ]);
    // 沒有負債時，下方整條都是淨資產
    expect(bars.liabilityRow.map((s) => [s.kind, s.percent])).toEqual([['net_worth', 100]]);
  });

  it('負債大於資產時，資產列補上缺口段，兩條等長', () => {
    const bars = balanceBars(summarize([item('bank', '40000'), item('loan', '100000')], noRates));
    expect(bars.assetRow.map((s) => [s.kind, s.percent])).toEqual([
      ['asset', 40],
      ['shortfall', 60],
    ]);
    expect(bars.liabilityRow.map((s) => s.percent)).toEqual([100]);
    expect(bars.scale).toBe(dec('100000'));
  });

  it('使用者實際數字：負債佔資產 94%', () => {
    const bars = balanceBars(
      summarize(
        [item('bank', '159018'), item('stock', '1383053'), item('loan', '1040318'), item('loan', '407063')],
        noRates,
      ),
    );
    expect(bars.liabilityRatio).toBe(93.86);
    expect(bars.liabilityRow.at(-1)!.kind).toBe('net_worth');
    expect(twd(bars.liabilityRow.at(-1)!.value)).toBe('94690');
  });

  it('沒有任何資料時兩條都是空的', () => {
    const bars = balanceBars(summarize([], noRates));
    expect(bars.assetRow).toEqual([]);
    expect(bars.liabilityRow).toEqual([]);
    expect(bars.liabilityRatio).toBeNull();
  });
});
