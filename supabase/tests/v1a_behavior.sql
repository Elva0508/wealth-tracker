-- V1a 資料庫行為測試：RLS 隔離、修改紀錄、快照一天一筆、備份還原
-- 執行方式見 README「測試」一節
\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001'), ('bbbbbbbb-0000-4000-8000-000000000002');
select count(*) as settings_rows from user_settings;

-- 使用者 A
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
insert into balance_items (kind, category, name, amount) values ('asset','cash_bank','A 存款', 100000), ('liability','loan','A 信貸', 50000);
update balance_items set amount = 120000 where name = 'A 存款';
update balance_items set status='archived', archived_at=now() where name = 'A 信貸';
select field, old_value, new_value from balance_item_changes order by field;
-- 負數與分類不符應失敗
do $$ begin insert into balance_items (kind, category, name, amount) values ('asset','cash_bank','x', -1); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'negative amount rejected: ok'; end $$;
do $$ begin insert into balance_items (kind, category, name, amount) values ('asset','loan','x', 1); raise exception 'SHOULD FAIL'; exception when check_violation then raise notice 'kind/category mismatch rejected: ok'; end $$;
-- 不能幫別人新增
do $$ begin insert into balance_items (user_id, kind, category, name, amount) values ('bbbbbbbb-0000-4000-8000-000000000002','asset','cash_bank','x', 1); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'insert for other user rejected: ok'; end $$;
-- 不能直接寫快照、不能呼叫 save_snapshot、不能刪除
do $$ begin insert into net_worth_snapshots (user_id, snapshot_date, total_assets, total_liabilities, net_worth, fx_status) values (auth.uid(), '2026-10-01', 1,1,0,'fresh'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'direct snapshot write rejected: ok'; end $$;
do $$ begin perform save_snapshot(auth.uid(), '2026-10-01', 1,1,0,'fresh','[]'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'save_snapshot by user rejected: ok'; end $$;
do $$ begin delete from balance_items; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'delete rejected: ok'; end $$;
select count(*) as a_items_after_delete_attempt from balance_items;

-- 使用者 B 看不到 A 的資料（規格案例 13）
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002', false);
select count(*) as b_sees_items from balance_items;
select count(*) as b_sees_changes from balance_item_changes;
update balance_items set amount = 0; 
reset role;
select name, amount from balance_items order by name;

-- 匿名者
set role anon;
do $$ begin perform count(*) from balance_items; raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'anon read rejected: ok'; end $$;
reset role;

-- 匯率：同一天 bot 優先；較新的日期優先
insert into fx_rates (currency, rate_date, mid_rate, source) values
 ('USD','2026-10-18', 32.1, 'bot'), ('USD','2026-10-19', 32.6, 'er_api'), ('USD','2026-10-19', 32.5, 'bot'),
 ('JPY','2026-10-17', 0.21, 'bot'), ('JPY','2026-10-19', 0.22, 'er_api');
set role authenticated;
select currency, rate_date, mid_rate, source from fx_latest order by currency;
do $$ begin insert into fx_rates (currency, rate_date, mid_rate, source) values ('EUR','2026-10-19',35,'bot'); raise exception 'SHOULD FAIL'; exception when insufficient_privilege then raise notice 'user fx write rejected: ok'; end $$;
reset role;

-- 快照：同一天重跑只有一筆（規格案例 10）
set role service_role;
select save_snapshot('aaaaaaaa-0000-4000-8000-000000000001','2026-10-19', 120000, 0, 120000, 'fresh',
  (select jsonb_agg(jsonb_build_object('item_id', id, 'category', category, 'currency', currency, 'amount', amount, 'fx_rate', 1, 'amount_base', amount)) from balance_items where status='active' and user_id='aaaaaaaa-0000-4000-8000-000000000001')) is not null as saved1;
select save_snapshot('aaaaaaaa-0000-4000-8000-000000000001','2026-10-19', 130000, 0, 130000, 'fresh', '[]') is not null as saved2;
reset role;
select count(*) as snapshots_for_day, max(net_worth) as latest_net from net_worth_snapshots where snapshot_date='2026-10-19';

-- 還原（規格案例 15）：用目前資料組成備份 → 清空 → 還原 → 比對
create temp table before as select id, name, amount, status from balance_items where user_id='aaaaaaaa-0000-4000-8000-000000000001';
grant select on before to authenticated;
select save_snapshot('aaaaaaaa-0000-4000-8000-000000000001','2026-10-18', 100000, 50000, 50000, 'fresh',
  (select jsonb_agg(jsonb_build_object('item_id', id, 'category', category, 'currency', currency, 'amount', amount, 'fx_rate', 1, 'amount_base', amount)) from balance_items where user_id='aaaaaaaa-0000-4000-8000-000000000001'));
create temp table bk as select jsonb_build_object(
  'format','personal-wealth-tracker-backup','version',1,
  'data', jsonb_build_object(
    'settings', jsonb_build_object('hide_amounts', false, 'cost_method','fifo'),
    'items', (select jsonb_agg(to_jsonb(i) - 'user_id') from balance_items i where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'itemChanges', (select jsonb_agg(to_jsonb(c) - 'user_id') from balance_item_changes c where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'snapshots', (select jsonb_agg(to_jsonb(s) - 'user_id') from net_worth_snapshots s where user_id='aaaaaaaa-0000-4000-8000-000000000001'),
    'snapshotLines', (select jsonb_agg(to_jsonb(l) - 'user_id') from snapshot_lines l where user_id='aaaaaaaa-0000-4000-8000-000000000001')
  )) as b;
grant select on bk to authenticated;
set role authenticated; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001', false);
update balance_items set name = '改過的名稱';
insert into balance_items (kind, category, name, amount) values ('asset','other_asset','還原後應消失', 1);
select restore_backup((select b from bk)) as restored;
select (select count(*) from balance_items) as items, (select count(*) from net_worth_snapshots) as snapshots,
       (select count(*) from snapshot_lines) as lines, (select count(*) from balance_item_changes) as changes,
       (select hide_amounts::text || '/' || cost_method from user_settings) as settings,
       (select count(*) from (select id, name, amount, status from balance_items except select * from before) x) as diff_rows;
reset role;
-- Edge Function（service role）需要的權限
set role service_role;
select count(*) >= 0 as service_can_read_items from balance_items;
insert into fx_rates (currency, rate_date, mid_rate, source) values ('EUR','2026-10-19', 35.1, 'bot')
  on conflict (currency, quote_currency, rate_date, source) do update set mid_rate = excluded.mid_rate, fetched_at = now();
select count(*) as service_reads_fx_latest from fx_latest;
reset role;

select 'ALL SQL TESTS PASSED' as result;
