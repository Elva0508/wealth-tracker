-- 分類改成三層的資料庫測試：舊資料轉換、修改紀錄不受影響、新的分類限制、細項、還原舊備份
-- 要依序接在 v1a_behavior.sql、v1b_loans.sql 與 20261022000000_categories.sql 之後執行
\set ON_ERROR_STOP 1

-- 舊分類代碼都已經換掉
select count(*) as legacy_items_left from balance_items where category in ('cash_bank', 'securities', 'other_asset', 'daily_liability');
select count(*) as legacy_lines_left from snapshot_lines where category in ('cash_bank', 'securities', 'other_asset', 'daily_liability');
select category, count(*) from balance_items group by category order by category;
-- 轉換不算使用者的修改：沒有新增「分類」修改紀錄
select count(*) as category_change_logs from balance_item_changes where field = 'category' and new_value = 'bank';

set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
-- 新分類可以新增，細項可以留空
insert into balance_items (kind, category, subtype, name, amount) values
  ('asset', 'ewallet', 'jkopay', '街口', 1200),
  ('asset', 'real_estate', null, '自住房', 8000000),
  ('asset', 'lending', null, '借給朋友', 30000),
  ('liability', 'credit_card', null, '玉山卡', 15000);
select name, category, subtype from balance_items where category in ('ewallet', 'real_estate', 'lending', 'credit_card') order by name;
-- 舊代碼與大類不符的組合都會被擋
do $$ begin insert into balance_items (kind, category, name, amount) values ('asset', 'cash_bank', 'x', 1); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'legacy category rejected: ok'; end $$;
do $$ begin insert into balance_items (kind, category, name, amount) values ('asset', 'credit_card', 'x', 1); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'liability category as asset rejected: ok'; end $$;
do $$ begin insert into balance_items (kind, category, subtype, name, amount) values ('asset', 'cash', repeat('x', 41), 'x', 1); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'subtype too long rejected: ok'; end $$;
-- 新增貸款可以帶細項；只有一個 create_loan
select create_loan('學貸', 'TWD', '2026-07-01', 400000, '2026-08-01', 1.775, 'defer_all', null, null, null, 0, 'student') is not null as created;
select subtype from balance_items where name = '學貸' and subtype is not null;
reset role;
select count(*) as create_loan_versions from pg_proc where proname = 'create_loan';

-- 還原舊版備份（舊分類代碼）會換成新分類
create temp table legacy_bk as select jsonb_build_object(
  'format','personal-wealth-tracker-backup','version',1,
  'data', jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('id', 'cccccccc-0000-4000-8000-000000000001', 'kind', 'asset', 'category', 'cash_bank', 'name', '舊存款', 'currency', 'TWD', 'amount', 100, 'status', 'active'),
      jsonb_build_object('id', 'cccccccc-0000-4000-8000-000000000002', 'kind', 'liability', 'category', 'daily_liability', 'name', '舊負債', 'currency', 'TWD', 'amount', 50, 'status', 'active')),
    'snapshots', jsonb_build_array(jsonb_build_object('id', 'dddddddd-0000-4000-8000-000000000001', 'snapshot_date', '2026-01-01', 'total_assets', 100, 'total_liabilities', 50, 'net_worth', 50, 'fx_status', 'fresh')),
    'snapshotLines', jsonb_build_array(jsonb_build_object('snapshot_id', 'dddddddd-0000-4000-8000-000000000001', 'item_id', 'cccccccc-0000-4000-8000-000000000001', 'category', 'securities', 'currency', 'TWD', 'amount', 100))
  )) as b;
grant select on legacy_bk to authenticated;
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
select restore_backup((select b from legacy_bk)) ->> 'items' as restored_items;
select string_agg(name || '=' || category, ', ' order by name) as restored from balance_items;
select category as restored_line_category from snapshot_lines;
reset role;

select 'ALL CATEGORY SQL TESTS PASSED' as result;
