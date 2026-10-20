import { describe, expect, it } from 'vitest';
import { add, dec, div, formatMoney, formatNumber, mul, percentOf, round, toFixedString } from '../index.ts';

describe('定點小數', () => {
  it('規格案例 12：0.1 + 0.2 = 0.3，不出現浮點誤差', () => {
    expect(toFixedString(add(dec('0.1'), dec('0.2')), 1)).toBe('0.3');
    expect(add(dec('0.1'), dec('0.2'))).toBe(dec('0.3'));
  });

  it('解析各種小數字串', () => {
    expect(toFixedString(dec('1234.5'), 2)).toBe('1234.50');
    expect(toFixedString(dec('-0.25'), 2)).toBe('-0.25');
    expect(toFixedString(dec('7'), 0)).toBe('7');
    expect(toFixedString(dec(' 3.14 '), 2)).toBe('3.14');
  });

  it('超過 6 位小數時四捨五入', () => {
    expect(toFixedString(dec('1.0000005'))).toBe('1.000001');
    expect(toFixedString(dec('1.0000004'))).toBe('1.000000');
  });

  it('拒絕不合法的格式', () => {
    expect(() => dec('1,000')).toThrow();
    expect(() => dec('abc')).toThrow();
    expect(() => dec('1e5')).toThrow();
    expect(() => dec(Number.NaN)).toThrow();
  });

  it('乘法與除法四捨五入（0.5 遠離 0）', () => {
    expect(toFixedString(mul(dec('1000'), dec('32.48')), 0)).toBe('32480');
    expect(toFixedString(round(dec('1.005'), 2), 2)).toBe('1.01');
    expect(toFixedString(round(dec('-1.005'), 2), 2)).toBe('-1.01');
    expect(toFixedString(div(dec('1'), dec('3')))).toBe('0.333333');
    expect(() => div(dec('1'), dec('0'))).toThrow();
  });

  it('大金額不失準', () => {
    const big = dec('9999999999999999.9999');
    expect(toFixedString(add(big, dec('0.0001')), 4)).toBe('10000000000000000.0000');
  });

  it('占比', () => {
    expect(percentOf(dec('1'), dec('3'))).toBe(33.33);
    expect(percentOf(dec('1'), dec('0'))).toBe(0);
  });
});

describe('金額格式', () => {
  it('千分位', () => {
    expect(formatNumber(dec('1234567.5'), 2)).toBe('1,234,567.50');
    expect(formatNumber(dec('-94690'), 0)).toBe('-94,690');
    expect(formatNumber(dec('999'), 0)).toBe('999');
  });

  it('新台幣顯示整數，外幣顯示 2 位小數', () => {
    expect(formatMoney(dec('32480.4'), 'TWD')).toBe('NT$ 32,480');
    expect(formatMoney(dec('1000'), 'USD')).toBe('US$ 1,000.00');
    expect(formatMoney(dec('5'), 'CHF')).toBe('CHF 5.00');
  });
});
