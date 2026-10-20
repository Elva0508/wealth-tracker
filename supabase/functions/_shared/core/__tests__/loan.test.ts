import { describe, expect, it } from 'vitest';
import {
  type Loan,
  type ModeChange,
  annuityPayment,
  buildSchedule,
  dec,
  loanBalanceOn,
  nextPayment,
  parseRateInput,
  validateLoanInput,
  validateModeInput,
  toFixedString,
} from '../index.ts';

const twd = (value: bigint) => toFixedString(value, 0);
const FAR = '2100-01-01';

function loan(extra: Partial<Loan> & { mode?: Partial<ModeChange>; rate?: string } = {}): Loan {
  const { mode, rate, ...rest } = extra;
  return {
    currency: 'TWD',
    startDate: '2026-01-15',
    principal: '1000000',
    firstPaymentDate: '2026-02-15',
    rateChanges: [{ effectiveDate: '2026-01-15', annualRate: rate ?? '2' }],
    modeChanges: [
      { effectiveDate: '2026-01-15', mode: 'annuity', termMonths: 240, interestEvery: null, ...mode } as ModeChange,
    ],
    adjustments: [],
    ...rest,
  };
}

const payments = (l: Loan, until = FAR) => buildSchedule(l, until).rows.filter((r) => r.type === 'payment');

describe('本息平均攤還', () => {
  it('100 萬、年利率 2%、20 年：每期 5,059 元，240 期剛好還清', () => {
    const rows = payments(loan());
    expect(rows).toHaveLength(240);
    expect(twd(rows[0].payment)).toBe('5059');
    expect(twd(rows[0].interest)).toBe('1667'); // 1,000,000 × 2% ÷ 12 = 1,666.67
    expect(twd(rows[0].principal)).toBe('3392');
    // 每期金額相同（最後一期把零頭還清）
    expect(new Set(rows.slice(0, -1).map((r) => twd(r.payment)))).toEqual(new Set(['5059']));
    expect(twd(rows.at(-1)!.balance)).toBe('0');
    expect(twd(rows.reduce((s, r) => s + r.principal, 0n))).toBe('1000000');
    expect(rows.at(-1)!.date).toBe('2046-01-15');
  });

  it('公式：年利率 0% 時每期 = 本金 ÷ 期數', () => {
    expect(twd(annuityPayment(dec('1200000'), dec('0'), 12))).toBe('100000');
  });

  it('利率調升：從生效後的下一期起，用剩餘期數重算每期金額，總期數不變', () => {
    const l = loan({
      rateChanges: [
        { effectiveDate: '2026-01-15', annualRate: '2' },
        { effectiveDate: '2027-01-15', annualRate: '2.5' },
      ],
    });
    const rows = payments(l);
    expect(rows).toHaveLength(240);
    expect(twd(rows[11].payment)).toBe('5059'); // 2027-01-15：仍是舊利率的那一期
    expect(toFixedString(rows[12].rate, 1)).toBe('2.5');
    expect(Number(twd(rows[12].payment))).toBeGreaterThan(5059);
    expect(twd(rows.at(-1)!.balance)).toBe('0');
    expect(rows.at(-1)!.date).toBe('2046-01-15');
  });

  it('提前還款、期數不變：每期金額降低，到期日不變', () => {
    const l = loan({ adjustments: [{ date: '2027-01-15', kind: 'prepayment', amount: '200000', keep: 'term' }] });
    const rows = payments(l);
    expect(Number(twd(rows[12].payment))).toBeLessThan(5059);
    expect(rows.at(-1)!.date).toBe('2046-01-15');
    expect(twd(rows.at(-1)!.balance)).toBe('0');
  });

  it('提前還款、月付不變：每期仍 5,059 元，提早還清', () => {
    const l = loan({ adjustments: [{ date: '2027-01-15', kind: 'prepayment', amount: '200000', keep: 'payment' }] });
    const rows = payments(l);
    expect(twd(rows[12].payment)).toBe('5059');
    expect(rows.at(-1)!.date < '2046-01-15').toBe(true);
    expect(twd(rows.at(-1)!.balance)).toBe('0');
  });
});

describe('本金平均攤還', () => {
  it('120 萬、年利率 3%、12 期：每期本金 10 萬，利息由 3,000 逐期降到 250', () => {
    const rows = payments(loan({ principal: '1200000', rate: '3', mode: { mode: 'equal_principal', termMonths: 12 } }));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => twd(r.principal) === '100000')).toBe(true);
    expect(twd(rows[0].interest)).toBe('3000');
    expect(twd(rows[11].interest)).toBe('250');
    expect(twd(rows[11].balance)).toBe('0');
  });
});

describe('到期一次還本', () => {
  it('每月只繳息，最後一期還清本金', () => {
    const rows = payments(loan({ principal: '600000', rate: '2.4', mode: { mode: 'bullet', termMonths: 6 } }));
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 5).every((r) => twd(r.principal) === '0' && twd(r.interest) === '1200')).toBe(true);
    expect(twd(rows[5].principal)).toBe('600000');
    expect(twd(rows[5].balance)).toBe('0');
  });
});

describe('學貸：緩繳本息 → 緩繳本金（每年繳息）→ 本息平均攤還', () => {
  const student = loan({
    principal: '400000',
    startDate: '2026-07-01',
    firstPaymentDate: '2026-08-01',
    rateChanges: [{ effectiveDate: '2026-07-01', annualRate: '1.775' }],
    modeChanges: [
      { effectiveDate: '2026-07-01', mode: 'defer_all', termMonths: null, interestEvery: null },
      { effectiveDate: '2027-07-01', mode: 'interest_only', termMonths: null, interestEvery: 12 },
      { effectiveDate: '2029-07-01', mode: 'annuity', termMonths: 96, interestEvery: null },
    ],
  });

  it('緩繳本息期間沒有任何扣款，本金不變', () => {
    const rows = buildSchedule(student, '2027-07-01').rows;
    expect(rows.filter((r) => r.type === 'payment' && r.date <= '2027-07-01')).toHaveLength(0);
    expect(twd(loanBalanceOn(student, '2027-06-30'))).toBe('400000');
  });

  it('緩繳本金期間每年繳一次息 7,100 元，本金不動', () => {
    const rows = payments(student, '2029-06-30');
    expect(rows.map((r) => r.date)).toEqual(['2028-07-01', '2029-07-01'].filter((d) => d <= '2029-06-30'));
    expect(twd(rows[0].interest)).toBe('7100'); // 400,000 × 1.775% = 7,100
    expect(twd(rows[0].principal)).toBe('0');
    expect(twd(loanBalanceOn(student, '2029-06-30'))).toBe('400000');
  });

  it('開始攤還後 96 期還清', () => {
    const rows = payments(student).filter((r) => r.mode === 'annuity');
    expect(rows).toHaveLength(96);
    expect(rows[0].date).toBe('2029-07-01');
    expect(twd(rows.at(-1)!.balance)).toBe('0');
  });

  it('一直緩繳（還沒記錄之後的切換）時，還款表只算到指定日期，餘額維持不變', () => {
    const deferring: Loan = { ...student, modeChanges: student.modeChanges.slice(0, 1) };
    const schedule = buildSchedule(deferring, '2030-01-01');
    expect(schedule.rows).toHaveLength(0);
    expect(schedule.paidOffAt).toBeNull();
    expect(nextPayment(deferring, '2026-10-20', '2030-01-01')).toBeNull();
  });
});

describe('按日計息與餘額查詢', () => {
  it('第一期不滿一個月時按日計息', () => {
    const rows = payments(loan({ startDate: '2026-02-05', firstPaymentDate: '2026-02-15' }));
    // 1,000,000 × 2% × 10 ÷ 365 = 547.95
    expect(twd(rows[0].interest)).toBe('548');
  });

  it('校正餘額：之後從校正後的本金接著算，到期日不變', () => {
    const l = loan({ adjustments: [{ date: '2030-01-20', kind: 'balance', amount: '800000', keep: 'term' }] });
    expect(twd(loanBalanceOn(l, '2030-01-20'))).toBe('800000');
    const rows = payments(l);
    expect(rows.at(-1)!.date).toBe('2046-01-15');
    expect(twd(rows.at(-1)!.balance)).toBe('0');
  });

  it('查詢兩次扣款之間的日期：反映最近一次扣款後的本金', () => {
    const l = loan();
    const afterFirst = payments(l)[0].balance;
    expect(loanBalanceOn(l, '2026-02-20')).toBe(afterFirst);
    expect(twd(loanBalanceOn(l, '2026-02-14'))).toBe('1000000');
    expect(twd(loanBalanceOn(l, '2025-12-31'))).toBe('1000000');
  });

  it('31 號扣款：小月取當月最後一天', () => {
    const rows = payments(loan({ startDate: '2026-01-01', firstPaymentDate: '2026-01-31' }), '2026-05-01');
    expect(rows.map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('外幣貸款四捨五入到分', () => {
    const rows = payments(loan({ currency: 'USD', principal: '10000', rate: '5', mode: { termMonths: 12 } }));
    expect(toFixedString(rows[0].payment, 2)).toBe('856.07');
  });
});

describe('表單檢查', () => {
  const base = {
    name: '房貸',
    startDate: '2026-01-15',
    principal: '1,000,000',
    firstPaymentDate: '2026-02-15',
    annualRate: '2.185%',
    mode: 'annuity' as const,
    termMonths: '240',
    interestEvery: 1,
  };

  it('正常輸入：金額去掉千分位、利率去掉 %', () => {
    const r = validateLoanInput(base);
    expect(r.ok && r.value.principal).toBe('1000000');
    expect(r.ok && r.value.annualRate).toBe('2.185');
    expect(r.ok && r.value.mode).toEqual({
      effectiveDate: '2026-01-15',
      mode: 'annuity',
      termMonths: 240,
      interestEvery: null,
    });
  });

  it('第一次扣款日不能早於起算日、期數必須是整數、本金不能是 0', () => {
    const r = validateLoanInput({ ...base, firstPaymentDate: '2026-01-10', termMonths: '12.5', principal: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['firstPaymentDate', 'principal', 'termMonths']);
  });

  it('緩繳本息不需要期數；只繳息要選繳息頻率', () => {
    expect(
      validateModeInput({ effectiveDate: '2026-07-01', mode: 'defer_all', termMonths: '', interestEvery: 1 }).ok,
    ).toBe(true);
    const r = validateModeInput({
      effectiveDate: '2026-07-01',
      mode: 'interest_only',
      termMonths: '',
      interestEvery: 12,
    });
    expect(r.ok && r.value.interestEvery).toBe(12);
    expect(parseRateInput('101').ok).toBe(false);
    expect(parseRateInput('1.77500')).toEqual({ ok: true, value: '1.775' });
  });
});
