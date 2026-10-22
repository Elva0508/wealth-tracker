-- 寬限期的資料庫測試：新增時同時寫入「只繳息」與寬限期結束後的攤還
-- 要依序接在 categories.sql 與 20261023000000_v1b_loan_grace.sql 之後執行（沿用 v1a_behavior.sql 建立的使用者）
\set ON_ERROR_STOP 1

set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
select create_loan('寬限房貸', 'TWD', '2026-01-15', 1000000, '2026-02-15', 2, 'interest_only', null, 1,
  null, 0, 'mortgage', '2029-02-15', 'annuity', 204) is not null as created_with_grace;
select string_agg(mode || coalesce(':' || term_months, ''), ',' order by effective_date) as grace_modes
  from loan_mode_changes where loan_id = (select l.id from loans l join balance_items i on i.id = l.item_id where i.name = '寬限房貸');
-- 沒有寬限期時照舊只有一筆還款方式
select create_loan('信貸', 'TWD', '2026-01-15', 300000, '2026-02-15', 3, 'annuity', 60, null) is not null as created_without_grace;
select count(*) as modes_without_grace
  from loan_mode_changes where loan_id = (select l.id from loans l join balance_items i on i.id = l.item_id where i.name = '信貸');
do $$ begin perform create_loan('x', 'TWD', '2026-01-15', 1000, '2026-02-15', 2, 'interest_only', null, 1, null, 0, null, '2026-01-01', 'annuity', 12); raise exception 'SHOULD FAIL'; exception when raise_exception then raise notice 'grace end before start rejected: ok'; end $$;
reset role;

select 'ALL LOAN GRACE SQL TESTS PASSED' as result;
