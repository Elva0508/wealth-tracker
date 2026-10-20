import { describe, expect, it } from 'vitest';
import { defaultItemName, parseAmountInput, validateItemInput } from '../index.ts';

describe('金額輸入', () => {
  it('規格案例 16：負數被拒絕，提示輸入正數', () => {
    const result = parseAmountInput('-5000');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/正數/);
  });

  it('接受千分位與空白，並正規化', () => {
    expect(parseAmountInput(' 1,234,567.50 ')).toEqual({ ok: true, value: '1234567.5' });
    expect(parseAmountInput('007')).toEqual({ ok: true, value: '7' });
    expect(parseAmountInput('0')).toEqual({ ok: true, value: '0' });
    expect(parseAmountInput('12.')).toEqual({ ok: true, value: '12' });
  });

  it('拒絕空白、文字、過多小數與過大的數字', () => {
    expect(parseAmountInput('').ok).toBe(false);
    expect(parseAmountInput('abc').ok).toBe(false);
    expect(parseAmountInput('1.23456').ok).toBe(false);
    expect(parseAmountInput('12345678901234567').ok).toBe(false);
  });
});

describe('預設名稱', () => {
  it('依分類編號，跳過已使用的名稱', () => {
    expect(defaultItemName('cash_bank', [])).toBe('銀行帳戶 1');
    expect(defaultItemName('cash_bank', ['銀行帳戶 1', '銀行帳戶 3'])).toBe('銀行帳戶 2');
    expect(defaultItemName('loan', ['銀行帳戶 1'])).toBe('貸款 1');
  });
});

describe('整份表單', () => {
  it('名稱留空時補上預設名稱，幣別轉大寫', () => {
    const result = validateItemInput(
      { category: 'cash_bank', name: '  ', currency: 'usd', amount: '1,000', notes: '' },
      ['銀行帳戶 1'],
    );
    expect(result).toEqual({
      ok: true,
      value: { category: 'cash_bank', name: '銀行帳戶 2', currency: 'USD', amount: '1000', notes: null },
    });
  });

  it('同時回報多個錯誤', () => {
    const result = validateItemInput({ category: 'loan', name: 'x', currency: 'US', amount: '-1', notes: '' }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.currency).toBeDefined();
      expect(result.errors.amount).toMatch(/正數/);
    }
  });
});
