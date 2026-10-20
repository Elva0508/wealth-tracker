-- =============================================================
-- Personal Wealth Tracker — V1a 初始資料結構
--
-- 原則：
-- 1. 所有金額與匯率使用 numeric，不使用浮點數
-- 2. 每張使用者資料表都有 user_id 並啟用 RLS：只能讀寫自己的資料
-- 3. 快照與修改紀錄由系統寫入，使用者只能讀取
-- 4. 匯率是共用的公開資料：登入者可讀，只有 Edge Function（service role）可寫
-- =============================================================

-- ---------- 共用：自動更新 updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- 個人設定 ----------
create table public.user_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  base_currency char(3) not null default 'TWD' check (base_currency ~ '^[A-Z]{3}$'),
  -- 開啟 App 時是否預設隱藏金額
  hide_amounts  boolean not null default true,
  -- V1b 使用：weighted_average / fifo
  cost_method   text not null default 'weighted_average' check (cost_method in ('weighted_average', 'fifo')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- 新使用者註冊時自動建立設定
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 資產與負債項目 ----------
create table public.balance_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('asset', 'liability')),
  category        text not null,
  name            text not null check (char_length(name) between 1 and 60),
  currency        char(3) not null default 'TWD' check (currency ~ '^[A-Z]{3}$'),
  -- 原幣金額，一律正數；負債也存正數
  amount          numeric(20, 4) not null check (amount >= 0),
  notes           text check (char_length(notes) <= 500),
  -- manual = V1a 手動項目；V1b/V1c 會新增 securities_account / loan
  source_type     text not null default 'manual' check (source_type in ('manual', 'securities_account', 'loan')),
  status          text not null default 'active' check (status in ('active', 'archived')),
  archived_at     timestamptz,
  -- 轉換精靈使用：指向轉換後的正式資料
  converted_to_id uuid,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint balance_items_kind_category check (
    (kind = 'asset' and category in ('cash_bank', 'securities', 'other_asset'))
    or (kind = 'liability' and category in ('loan', 'daily_liability'))
  ),
  constraint balance_items_archived_at check ((status = 'archived') = (archived_at is not null))
);

create index balance_items_user_idx on public.balance_items (user_id, status, category, sort_order);

create trigger balance_items_updated_at
  before update on public.balance_items
  for each row execute function public.set_updated_at();

-- ---------- 項目修改紀錄 ----------
create table public.balance_item_changes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    uuid not null references public.balance_items (id) on delete cascade,
  field      text not null check (field in ('amount', 'currency', 'name', 'status', 'category')),
  old_value  text,
  new_value  text,
  changed_at timestamptz not null default now()
);

create index balance_item_changes_item_idx on public.balance_item_changes (item_id, changed_at desc);

-- 項目被修改時，自動記錄有變動的欄位
create or replace function public.log_balance_item_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount then
    insert into public.balance_item_changes (user_id, item_id, field, old_value, new_value)
    values (new.user_id, new.id, 'amount', old.amount::text, new.amount::text);
  end if;
  if new.currency is distinct from old.currency then
    insert into public.balance_item_changes (user_id, item_id, field, old_value, new_value)
    values (new.user_id, new.id, 'currency', old.currency, new.currency);
  end if;
  if new.name is distinct from old.name then
    insert into public.balance_item_changes (user_id, item_id, field, old_value, new_value)
    values (new.user_id, new.id, 'name', old.name, new.name);
  end if;
  if new.status is distinct from old.status then
    insert into public.balance_item_changes (user_id, item_id, field, old_value, new_value)
    values (new.user_id, new.id, 'status', old.status, new.status);
  end if;
  if new.category is distinct from old.category then
    insert into public.balance_item_changes (user_id, item_id, field, old_value, new_value)
    values (new.user_id, new.id, 'category', old.category, new.category);
  end if;
  return new;
end;
$$;

create trigger balance_items_log_changes
  after update on public.balance_items
  for each row execute function public.log_balance_item_changes();

-- ---------- 匯率歷史（共用） ----------
create table public.fx_rates (
  id             uuid primary key default gen_random_uuid(),
  currency       char(3) not null check (currency ~ '^[A-Z]{3}$'),
  quote_currency char(3) not null default 'TWD',
  -- 匯率所屬日期；同一天重複抓取時更新同一列，保留每天的歷史
  rate_date      date not null,
  spot_buy       numeric(18, 6),
  spot_sell      numeric(18, 6),
  -- 實際換算使用的匯率：1 外幣 = mid_rate 新台幣
  mid_rate       numeric(18, 6) not null check (mid_rate > 0),
  source         text not null check (source in ('bot', 'er_api')),
  fetched_at     timestamptz not null default now(),
  unique (currency, quote_currency, rate_date, source)
);

create index fx_rates_latest_idx on public.fx_rates (currency, rate_date desc, fetched_at desc);

-- 每個幣別目前要使用的匯率：
-- 最新日期優先；同一天兩個來源都有時，臺灣銀行（bot）優先
create view public.fx_latest
with (security_invoker = true)
as
select distinct on (currency, quote_currency)
  currency,
  quote_currency,
  rate_date,
  mid_rate,
  source,
  fetched_at
from public.fx_rates
order by currency, quote_currency, rate_date desc, (source = 'bot') desc, fetched_at desc;

-- ---------- 每日快照 ----------
create table public.net_worth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- 前一天的日期，代表前一個交易日結束時的資產狀況
  snapshot_date     date not null,
  total_assets      numeric(20, 4) not null,
  total_liabilities numeric(20, 4) not null,
  net_worth         numeric(20, 4) not null,
  fx_status         text not null check (fx_status in ('fresh', 'fallback', 'stale', 'missing')),
  created_at        timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create table public.snapshot_lines (
  snapshot_id uuid not null references public.net_worth_snapshots (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- 不設外鍵：項目之後就算被刪除，快照明細仍保留
  item_id     uuid not null,
  category    text not null,
  currency    char(3) not null,
  amount      numeric(20, 4) not null,
  fx_rate     numeric(18, 6),
  amount_base numeric(20, 4),
  primary key (snapshot_id, item_id)
);

create index snapshot_lines_user_idx on public.snapshot_lines (user_id);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.user_settings        enable row level security;
alter table public.balance_items        enable row level security;
alter table public.balance_item_changes enable row level security;
alter table public.fx_rates             enable row level security;
alter table public.net_worth_snapshots  enable row level security;
alter table public.snapshot_lines       enable row level security;

-- 個人設定：讀、改自己的（新增由註冊 trigger 處理）
create policy "settings: read own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: update own" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 項目：完整讀寫自己的
create policy "items: read own" on public.balance_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "items: insert own" on public.balance_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "items: update own" on public.balance_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- 不開放 delete：項目只封存不刪除

-- 修改紀錄、快照：只能讀自己的，由 trigger 或 Edge Function 寫入
create policy "changes: read own" on public.balance_item_changes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "snapshots: read own" on public.net_worth_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
create policy "snapshot lines: read own" on public.snapshot_lines
  for select to authenticated using (user_id = (select auth.uid()));

-- 匯率：登入者都可讀；沒有寫入 policy，只有 service role 能寫
create policy "fx: read for signed-in users" on public.fx_rates
  for select to authenticated using (true);

-- =============================================================
-- 資料表權限（GRANT）
-- 不依賴 Supabase「Automatically expose new tables」設定：
-- 這裡明確列出每個角色能做什麼，RLS 再進一步限制只能碰自己的資料。
-- =============================================================

-- 匿名使用者不需要任何資料表權限
revoke all on public.user_settings, public.balance_items, public.balance_item_changes,
  public.fx_rates, public.net_worth_snapshots, public.snapshot_lines, public.fx_latest from anon;

-- 登入的使用者：只開放 App 用得到的動作（沒有 delete）
revoke all on public.user_settings, public.balance_items, public.balance_item_changes,
  public.fx_rates, public.net_worth_snapshots, public.snapshot_lines, public.fx_latest from authenticated;
grant select, update on public.user_settings to authenticated;
grant select, insert, update on public.balance_items to authenticated;
grant select on public.balance_item_changes, public.fx_rates, public.fx_latest,
  public.net_worth_snapshots, public.snapshot_lines to authenticated;

-- Edge Function（service role）：讀取項目、寫入匯率、透過 save_snapshot() 寫快照
grant select on public.balance_items, public.fx_latest to service_role;
grant select, insert, update on public.fx_rates to service_role;

-- =============================================================
-- 由 Edge Function 呼叫：寫入一位使用者某一天的快照
-- 同一天重跑時整筆覆蓋（規格案例 10：同一天只有一筆快照）
-- =============================================================
create or replace function public.save_snapshot(
  p_user_id uuid,
  p_snapshot_date date,
  p_total_assets numeric,
  p_total_liabilities numeric,
  p_net_worth numeric,
  p_fx_status text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
begin
  insert into public.net_worth_snapshots
    (user_id, snapshot_date, total_assets, total_liabilities, net_worth, fx_status)
  values
    (p_user_id, p_snapshot_date, p_total_assets, p_total_liabilities, p_net_worth, p_fx_status)
  on conflict (user_id, snapshot_date) do update set
    total_assets      = excluded.total_assets,
    total_liabilities = excluded.total_liabilities,
    net_worth         = excluded.net_worth,
    fx_status         = excluded.fx_status,
    created_at        = now()
  returning id into v_snapshot_id;

  delete from public.snapshot_lines where snapshot_id = v_snapshot_id;

  insert into public.snapshot_lines
    (snapshot_id, user_id, item_id, category, currency, amount, fx_rate, amount_base)
  select
    v_snapshot_id, p_user_id, l.item_id, l.category, l.currency, l.amount, l.fx_rate, l.amount_base
  from jsonb_to_recordset(p_lines) as l(
    item_id uuid, category text, currency char(3), amount numeric, fx_rate numeric, amount_base numeric
  );

  return v_snapshot_id;
end;
$$;

revoke execute on function public.save_snapshot from public, anon, authenticated;
grant execute on function public.save_snapshot to service_role;

-- =============================================================
-- 由前端呼叫：用備份檔覆蓋自己的所有資料（在同一個交易內完成）
-- 匯率是共用資料，不還原。前端在呼叫前會先下載一份目前資料的備份。
-- =============================================================
create or replace function public.restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_items int;
  v_snapshots int;
begin
  if v_user is null then
    raise exception '需要登入才能還原';
  end if;
  if p_backup ->> 'format' is distinct from 'personal-wealth-tracker-backup' then
    raise exception '不是本 App 的備份檔';
  end if;

  -- 先清掉自己的資料（修改紀錄、快照明細會跟著 cascade 刪除）
  delete from public.net_worth_snapshots where user_id = v_user;
  delete from public.balance_items where user_id = v_user;

  insert into public.balance_items
    (id, user_id, kind, category, name, currency, amount, notes, source_type, status,
     archived_at, converted_to_id, sort_order, created_at, updated_at)
  select
    i.id, v_user, i.kind, i.category, i.name, i.currency, i.amount, i.notes,
    coalesce(i.source_type, 'manual'), i.status, i.archived_at, i.converted_to_id,
    coalesce(i.sort_order, 0), coalesce(i.created_at, now()), coalesce(i.updated_at, now())
  from jsonb_to_recordset(p_backup -> 'data' -> 'items') as i(
    id uuid, kind text, category text, name text, currency char(3), amount numeric, notes text,
    source_type text, status text, archived_at timestamptz, converted_to_id uuid, sort_order int,
    created_at timestamptz, updated_at timestamptz
  );
  get diagnostics v_items = row_count;

  insert into public.balance_item_changes (id, user_id, item_id, field, old_value, new_value, changed_at)
  select c.id, v_user, c.item_id, c.field, c.old_value, c.new_value, c.changed_at
  from jsonb_to_recordset(coalesce(p_backup -> 'data' -> 'itemChanges', '[]'::jsonb)) as c(
    id uuid, item_id uuid, field text, old_value text, new_value text, changed_at timestamptz
  );

  insert into public.net_worth_snapshots
    (id, user_id, snapshot_date, total_assets, total_liabilities, net_worth, fx_status, created_at)
  select s.id, v_user, s.snapshot_date, s.total_assets, s.total_liabilities, s.net_worth,
    s.fx_status, coalesce(s.created_at, now())
  from jsonb_to_recordset(p_backup -> 'data' -> 'snapshots') as s(
    id uuid, snapshot_date date, total_assets numeric, total_liabilities numeric, net_worth numeric,
    fx_status text, created_at timestamptz
  );
  get diagnostics v_snapshots = row_count;

  insert into public.snapshot_lines
    (snapshot_id, user_id, item_id, category, currency, amount, fx_rate, amount_base)
  select l.snapshot_id, v_user, l.item_id, l.category, l.currency, l.amount, l.fx_rate, l.amount_base
  from jsonb_to_recordset(p_backup -> 'data' -> 'snapshotLines') as l(
    snapshot_id uuid, item_id uuid, category text, currency char(3), amount numeric,
    fx_rate numeric, amount_base numeric
  );

  if p_backup -> 'data' -> 'settings' is not null and jsonb_typeof(p_backup -> 'data' -> 'settings') = 'object' then
    update public.user_settings set
      hide_amounts = coalesce((p_backup -> 'data' -> 'settings' ->> 'hide_amounts')::boolean, hide_amounts),
      cost_method  = coalesce(p_backup -> 'data' -> 'settings' ->> 'cost_method', cost_method)
    where user_id = v_user;
  end if;

  return jsonb_build_object('items', v_items, 'snapshots', v_snapshots);
end;
$$;

revoke execute on function public.restore_backup from public, anon;
grant execute on function public.restore_backup to authenticated;
