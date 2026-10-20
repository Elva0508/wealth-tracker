-- =============================================================
-- 排程設定（部署 Edge Functions 之後，在 Supabase SQL Editor 執行一次）
--
-- 執行前請先替換兩個值：
--   <PROJECT_URL>  例如 https://abcdefgh.supabase.co
--   <CRON_SECRET>  自己產生的一串亂碼，需與 Edge Function 的 CRON_SECRET 相同
--                  （可用 openssl rand -hex 32 產生）
--
-- 時間都是 UTC：台灣時間 = UTC + 8
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 把網址與密鑰存進 Vault，排程從 Vault 讀取，不寫死在排程內容裡
select vault.create_secret('<PROJECT_URL>', 'project_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');

-- 共用：呼叫某個 Edge Function
create or replace function public.call_edge_function(function_name text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;

revoke execute on function public.call_edge_function from public, anon, authenticated;

-- 1. 台灣營業日 9:00–16:00 每小時更新匯率（UTC 週一至週五 01:00–08:00）
select cron.schedule('fx-business-hours', '0 1-8 * * 1-5', $$ select public.call_edge_function('fetch-fx'); $$);

-- 2. 每天快照前先更新一次匯率（台灣 05:50 = UTC 21:50）
select cron.schedule('fx-before-snapshot', '50 21 * * *', $$ select public.call_edge_function('fetch-fx'); $$);

-- 3. 每日快照（台灣 06:00 = UTC 22:00），快照日期記為前一天
select cron.schedule('daily-snapshot', '0 22 * * *', $$ select public.call_edge_function('daily-snapshot'); $$);

-- 查看排程：           select * from cron.job;
-- 查看最近執行結果：   select * from cron.job_run_details order by start_time desc limit 20;
-- 查看 HTTP 回應：     select * from net._http_response order by created desc limit 20;
