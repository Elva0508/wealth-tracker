-- V1b 貸款資料庫行為測試：新增貸款、轉換手動項目、資料隔離、欄位限制、備份還原
-- 要接在 v1a_behavior.sql 之後執行（沿用它建立的兩位使用者）
\set ON_ERROR_STOP 1

-- 使用者 A：新增一筆學貸，再把手動輸入的貸款轉成自動計算
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
select create_loan('學貸', 'TWD', '2026-07-01', 400000, '2026-08-01', 1.775, 'defer_all', null, null) is not null as created;
insert into balance_items (kind, category, name, amount) values ('liability','loan','手動房貸', 5000000);
select create_loan('房貸', 'TWD', '2026-01-15', 5000000, '2026-02-15', 2.185, 'annuity', 360, null,
  (select id from balance_items where name = '手動房貸')) is not null as converted;
select name, source_type, amount from balance_items where source_type = 'loan' order by name;
select count(*) as loans, (select count(*) from loan_rate_changes) as rates, (select count(*) from loan_mode_changes) as modes from loans;

-- 學貸每年展延：記錄還款方式切換、利率變動、提前還款
insert into loan_mode_changes (loan_id, effective_date, mode, interest_every)
  select id, '2027-07-01', 'interest_only', 12 from loans where item_id = (select id from balance_items where name = '學貸');
insert into loan_rate_changes (loan_id, effective_date, annual_rate)
  select id, '2027-01-01', 1.8 from loans where item_id = (select id from balance_items where name = '學貸');
insert into loan_adjustments (loan_id, adjust_date, kind, amount, keep)
  select id, '2027-03-01', 'prepayment', 100000, 'payment' from loans where item_id = (select id from balance_items where name = '房貸');
-- 輸入錯誤可以刪除
delete from loan_rate_changes where effective_date = '2027-01-01';
select count(*) as rates_after_delete from loan_rate_changes;

-- 欄位限制
do $$ begin insert into loan_mode_changes (loan_id, effective_date, mode) select id, '2028-01-01', 'annuity' from loans limit 1; raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'annuity without term rejected: ok'; end $$;
do $$ begin insert into loan_mode_changes (loan_id, effective_date, mode, interest_every) select id, '2028-01-01', 'interest_only', 5 from loans limit 1; raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'bad interest frequency rejected: ok'; end $$;
do $$ begin insert into loan_rate_changes (loan_id, effective_date, annual_rate) select id, '2028-01-01', 120 from loans limit 1; raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'rate over 100 rejected: ok'; end $$;
do $$ begin perform create_loan('x', 'TWD', '2026-01-15', 1000, '2026-01-10', 2, 'annuity', 12, null); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'first payment before start rejected: ok'; end $$;
-- 已經是貸款的項目不能再轉換；資產項目不能轉成貸款
do $$ begin perform create_loan('x', 'TWD', '2026-01-15', 1000, '2026-02-15', 2, 'annuity', 12, null, (select id from balance_items where name = '房貸')); raise exception 'SHOULD FAIL'; exception when raise_exception then raise notice 'convert twice rejected: ok'; end $$;
-- 貸款只能掛在「貸款」分類的項目底下
do $$ begin insert into loans (item_id, start_date, principal, first_payment_date) select id, '2026-01-01', 1, '2026-02-01' from balance_items where category = 'cash_bank' limit 1; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'loan on asset item rejected: ok'; end $$;
reset role;

-- 使用者 B：看不到 A 的貸款，也不能在 A 的貸款底下新增資料
set role authenticated; select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002', false);
select count(*) as b_sees_loans, (select count(*) from loan_mode_changes) as b_sees_modes, (select count(*) from loan_adjustments) as b_sees_adjustments from loans;
do $$ begin insert into loan_rate_changes (loan_id, effective_date, annual_rate) values ((select id from loans limit 1), '2028-01-01', 1); raise exception 'SHOULD FAIL'; exception when not_null_violation or insufficient_privilege then raise notice 'B cannot see A loan ids: ok'; end $$;
reset role;
do $$
declare v_loan uuid := (select id from loans limit 1);
begin
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002', true);
  execute 'set local role authenticated';
  begin
    insert into loan_rate_changes (loan_id, effective_date, annual_rate) values (v_loan, '2028-01-01', 1);
    raise exception 'SHOULD FAIL';
  exception when insufficient_privilege then raise notice 'B insert under A loan rejected: ok';
  end;
  update loan_mode_changes set mode = 'defer_all', term_months = null where loan_id = v_loan;
  if found then raise exception 'SHOULD FAIL: B updated A data'; end if;
  delete from loan_adjustments where loan_id = v_loan;
  if found then raise exception 'SHOULD FAIL: B deleted A data'; end if;
  raise notice 'B update/delete on A loan data affects nothing: ok';
end $$;

-- 備份還原：A 的貸款與還款資料原樣回來；掛在別人項目底下的貸款會被略過
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
insert into balance_items (kind, category, name, amount) values ('liability','loan','B 的貸款項目', 1);
reset role;
update balance_items set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where name = 'B 的貸款項目';
create temp table loan_bk as select jsonb_build_object(
  'format','personal-wealth-tracker-backup','version',2,
  'data', jsonb_build_object(
    'items', (select jsonb_agg(to_jsonb(i) - 'user_id') from balance_items i where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'snapshots', '[]'::jsonb, 'snapshotLines', '[]'::jsonb,
    'loans', (select jsonb_agg(to_jsonb(l) - 'user_id') from loans l where user_id='aaaaaaaa-0000-4000-8000-000000000001')
      || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'item_id', (select id from balance_items where name = 'B 的貸款項目'),
           'start_date', '2026-01-01', 'principal', 1, 'first_payment_date', '2026-02-01')),
    'loanRateChanges', (select jsonb_agg(to_jsonb(r) - 'user_id') from loan_rate_changes r where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'loanModeChanges', (select jsonb_agg(to_jsonb(m) - 'user_id') from loan_mode_changes m where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'loanAdjustments', (select jsonb_agg(to_jsonb(a) - 'user_id') from loan_adjustments a where user_id='aaaaaaaa-0000-4000-8000-000000000001')
  )) as b;
create temp table loan_before as
  select (select count(*) from loans where user_id='aaaaaaaa-0000-4000-8000-000000000001') as loans,
         (select count(*) from loan_mode_changes where user_id='aaaaaaaa-0000-4000-8000-000000000001') as modes,
         (select count(*) from loan_adjustments where user_id='aaaaaaaa-0000-4000-8000-000000000001') as adjustments;
grant select on loan_bk, loan_before to authenticated;
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
delete from loan_adjustments;
select restore_backup((select b from loan_bk)) ->> 'loans' as restored_loans;
select (select count(*) from loans) = (select loans from loan_before) as loans_match,
       (select count(*) from loan_mode_changes) = (select modes from loan_before) as modes_match,
       (select count(*) from loan_adjustments) = (select adjustments from loan_before) as adjustments_match;
reset role;
select count(*) as b_item_still_unlinked from loans where item_id = (select id from balance_items where name = 'B 的貸款項目');

-- 每日快照（service role）可以讀還款資料
set role service_role;
select count(*) > 0 as service_reads_loans, (select count(*) > 0 from loan_mode_changes) as service_reads_modes from loans;
reset role;

select 'ALL V1B SQL TESTS PASSED' as result;
