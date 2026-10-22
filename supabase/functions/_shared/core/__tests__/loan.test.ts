import { describe, expect, it } from 'vitest';
import {
  type Loan,
  type LoanInput,
  type ModeChange,
  annuityPayment,
  buildSchedule,
  dec,
  firstPaymentDateFor,
  periodsUntil,
  previewLoan,
  loanBalanceOn,
  nextPayment,
  parseRateInput,
  validateLoanInput,
  validateModeInput,
  loansFromRows,
  withLoanBalances,
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
  const base: LoanInput = {
    stage: 'new',
    name: '房貸',
    mode: 'annuity',
    startDate: '2026-01-15',
    principal: '1,000,000',
    endDate: '2046-01-15',
    annualRate: '2.185%',
    graceMonths: '',
    interestEvery: 1,
  };

  it('正常輸入：金額去掉千分位、利率去掉 %，到期日換算成期數', () => {
    const r = validateLoanInput(base);
    expect(r.ok && r.value.principal).toBe('1000000');
    expect(r.ok && r.value.annualRate).toBe('2.185');
    expect(r.ok && r.value.mode).toEqual({
      effectiveDate: '2026-01-15',
      mode: 'annuity',
      termMonths: 240,
      interestEvery: null,
    });
    expect(r.ok && r.value.afterGrace).toBe(null);
  });

  it('到期日不能早於第一次扣款、本金不能是 0', () => {
    const r = validateLoanInput({ ...base, endDate: '2025-12-01', principal: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['endDate', 'principal']);
    const r2 = validateLoanInput({ ...base, endDate: '2026-02-01' });
    expect(!r2.ok && r2.errors.endDate).toBe('到期日要在第一次扣款日當天或之後');
  });

  it('第一次扣款日是起算日的下個月同一天', () => {
    const r = validateLoanInput(base);
    expect(r.ok && r.value.firstPaymentDate).toBe('2026-02-15');
  });

  it('寬限期拆成兩段：前 36 期每月只繳息，第 37 期起用剩下的 204 期攤還', () => {
    const r = validateLoanInput({ ...base, graceMonths: '36' });
    expect(r.ok && r.value.mode).toEqual({
      effectiveDate: '2026-01-15',
      mode: 'interest_only',
      termMonths: null,
      interestEvery: 1,
    });
    expect(r.ok && r.value.afterGrace).toEqual({
      effectiveDate: '2029-02-15',
      mode: 'annuity',
      termMonths: 204,
      interestEvery: null,
    });
    expect(validateLoanInput({ ...base, graceMonths: '240' }).ok).toBe(false);
  });

  it('緩繳本息不用填到期日，寬限期不適用', () => {
    const r = validateLoanInput({ ...base, mode: 'defer_all', endDate: '', graceMonths: '12' });
    expect(r.ok && r.value.mode.mode).toBe('defer_all');
    expect(r.ok && r.value.afterGrace).toBe(null);
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

describe('新增貸款的推算', () => {
  it('第一次扣款日：下個月同一天', () => {
    expect(firstPaymentDateFor('2026-07-16')).toBe('2026-08-16');
    expect(firstPaymentDateFor('2026-12-05')).toBe('2027-01-05');
  });

  it('到期日換算期數：數到到期日當天（含）為止的扣款日', () => {
    expect(periodsUntil('2026-04-05', '2046-03-20')).toBe(240);
    expect(periodsUntil('2026-04-20', '2046-03-20')).toBe(240);
    expect(periodsUntil('2026-04-25', '2046-03-20')).toBe(239);
    expect(periodsUntil('2026-04-05', '2026-04-05')).toBe(1);
    expect(periodsUntil('2026-04-05', '2026-04-04')).toBe(0);
  });

  const input: LoanInput = {
    stage: 'new',
    name: '房貸',
    mode: 'annuity',
    startDate: '2026-01-15',
    principal: '1000000',
    endDate: '2046-01-15',
    annualRate: '2',
    graceMonths: '',
    interestEvery: 1,
  };
  const valid = (extra: Partial<LoanInput> = {}) => {
    const r = validateLoanInput({ ...input, ...extra });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.value;
  };

  it('試算和還款表一致：100 萬、2%、20 年每月 5,059 元', () => {
    const p = previewLoan(valid(), 'TWD');
    expect(twd(p.regularPayment!)).toBe('5059');
    expect(p.first!.date).toBe('2026-02-15');
    expect(p.last!.date).toBe('2046-01-15');
    expect(p.gracePayment).toBe(null);
  });

  it('寬限期 36 期：每月只繳息 1,667 元，之後 204 期本金攤還，到期日不變', () => {
    const value = valid({ graceMonths: '36' });
    const p = previewLoan(value, 'TWD');
    expect(twd(p.gracePayment!)).toBe('1667');
    expect(twd(p.regularPayment!)).toBe(twd(annuityPayment(dec('1000000'), dec('2'), 204)));
    expect(p.last!.date).toBe('2046-01-15');
    const rows = payments({
      currency: 'TWD',
      startDate: value.startDate,
      principal: value.principal,
      firstPaymentDate: value.firstPaymentDate,
      rateChanges: [{ effectiveDate: value.startDate, annualRate: value.annualRate }],
      modeChanges: [value.mode, value.afterGrace!],
      adjustments: [],
    });
    expect(rows).toHaveLength(240);
    expect(rows[35]).toMatchObject({ mode: 'interest_only', date: '2029-01-15' });
    expect(twd(rows[35].principal)).toBe('0');
    expect(rows[36]).toMatchObject({ mode: 'annuity', date: '2029-02-15', period: 1, periodsInMode: 204 });
    expect(twd(rows.at(-1)!.balance)).toBe('0');
  });

  it('7/16 撥款、2026/07/16–2036/07/16：第一期 8/16，共 120 期，最後一期 2036/07/16', () => {
    const value = valid({ startDate: '2026-07-16', endDate: '2036-07-16' });
    expect(value.firstPaymentDate).toBe('2026-08-16');
    expect(value.periods).toBe(120);
    const p = previewLoan(value, 'TWD');
    expect(p.first!.date).toBe('2026-08-16');
    expect(twd(p.first!.interest)).toBe('1667'); // 整月計息：1,000,000 × 2% ÷ 12
    expect(p.last!.date).toBe('2036-07-16');
  });

  it('還款表引擎：撥款日和扣款日不同天時，第一期按實際天數計息，之後整月計息', () => {
    const rows = payments({
      ...loan(),
      startDate: '2026-03-20',
      firstPaymentDate: '2026-04-05',
    });
    expect(twd(rows[0].interest)).toBe('877'); // 1,000,000 × 2% × 16 ÷ 365 = 876.71
    expect(twd(rows[1].interest)).toBe(twd((rows[0].balance * 2n) / 1200n)); // 期初本金 × 2% ÷ 12
  });

  it('已經在繳：從剩餘本金的日期往後算，期數由到期日決定', () => {
    const value = valid({
      stage: 'ongoing',
      startDate: '2026-10-15',
      principal: '850000',
      endDate: '2046-01-15',
    });
    expect(value.periods).toBe(231);
    const p = previewLoan(value, 'TWD');
    expect(p.first!.date).toBe('2026-11-15');
    expect(twd(p.first!.interest)).toBe('1417'); // 850,000 × 2% ÷ 12
    expect(p.last!.date).toBe('2046-01-15');
  });
});

describe('接上首頁與快照', () => {
  it('資料庫資料組成貸款，貸款項目的金額換成當天的餘額，其他項目不變', () => {
    const loans = loansFromRows(
      [
        {
          id: 'L1',
          item_id: 'I1',
          start_date: '2026-01-15',
          principal: '1200000.0000',
          first_payment_date: '2026-02-15',
        },
      ],
      [{ loan_id: 'L1', effective_date: '2026-01-15', annual_rate: '3.0000' }],
      [{ loan_id: 'L1', effective_date: '2026-01-15', mode: 'equal_principal', term_months: 12, interest_every: null }],
      [],
      () => 'TWD',
    );
    const items = withLoanBalances(
      [
        { id: 'I1', amount: '1200000' },
        { id: 'I2', amount: '500' },
      ],
      loans,
      '2026-04-20',
    );
    expect(items).toEqual([
      { id: 'I1', amount: '900000.0000' }, // 已扣款 3 期，每期還 10 萬本金
      { id: 'I2', amount: '500' },
    ]);
  });
});
