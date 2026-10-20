-- =============================================================
-- Personal Wealth Tracker — V1b 貸款
--
-- 一筆貸款 = 一個「貸款」分類的項目（balance_items，source_type = 'loan'）＋ 這裡的還款資料。
-- 項目的金額由還款表算出來（共用計算模組 loan.ts），前端打開時同步、每日快照也用同一套算法，
-- 所以首頁總額、快照、匯出都沿用原本的項目，不需要另外處理。
--
-- 還款資料都以「從哪天起」記錄：利率變動、還款方式切換（學貸緩繳／展延）、提前還款與校正餘額。
-- =============================================================

-- ---------- 貸款 ----------
create table public.loans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id            uuid not null unique references public.balance_items (id) on delete cascade,
  -- 起算日與當天的本金：可以是撥款日與貸款金額，也可以是已經繳了一段時間後的剩餘本金
  start_date         date not null,
  principal          numeric(20, 4) not null check (principal > 0),
  -- 第一次扣款日；之後每月同一天
  first_payment_date date not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint loans_first_payment_after_start check (first_payment_date > start_date)
);

create trigger loans_updated_at
  before update on public.loans
  for each row execute function public.set_updated_at();

-- ---------- 利率變動 ----------
create table public.loan_rate_changes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id        uuid not null references public.loans (id) on delete cascade,
  effective_date date not null,
  -- 年利率 %
  annual_rate    numeric(7, 4) not null check (annual_rate >= 0 and annual_rate < 100),
  created_at     timestamptz not null default now(),
  unique (loan_id, effective_date)
);

-- ---------- 還款方式切換 ----------
create table public.loan_mode_changes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id        uuid not null references public.loans (id) on delete cascade,
  effective_date date not null,
  mode           text not null check (mode in ('defer_all', 'interest_only', 'annuity', 'equal_principal', 'bullet')),
  -- 攤還類的還款方式：從這次切換起算的期數
  term_months    integer check (term_months between 1 and 600),
  -- 只繳息：幾個月繳一次息
  interest_every integer check (interest_every in (1, 3, 6, 12)),
  created_at     timestamptz not null default now(),
  unique (loan_id, effective_date),
  constraint loan_mode_term check ((mode in ('annuity', 'equal_principal', 'bullet')) = (term_months is not null)),
  constraint loan_mode_interest_every check ((mode = 'interest_only') = (interest_every is not null))
);

-- ---------- 提前還款與校正餘額 ----------
create table public.loan_adjustments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id     uuid not null references public.loans (id) on delete cascade,
  adjust_date date not null,
  -- prepayment = 提前還款（amount 是多還的本金）；balance = 校正餘額（amount 是校正後的本金）
  kind        text not null check (kind in ('prepayment', 'balance')),
  amount      numeric(20, 4) not null check (amount >= 0),
  -- 提前還款後：term = 期數不變、降低每期金額；payment = 每期金額不變、提早還清
  keep        text not null default 'term' check (keep in ('term', 'payment')),
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);

create index loan_rate_changes_loan_idx on public.loan_rate_changes (loan_id, effective_date);
create index loan_mode_changes_loan_idx on public.loan_mode_changes (loan_id, effective_date);
create index loan_adjustments_loan_idx on public.loan_adjustments (loan_id, adjust_date);

-- =============================================================
-- Row Level Security：只能碰自己的資料，而且只能掛在自己的項目／貸款底下
-- =============================================================
alter table public.loans             enable row level security;
alter table public.loan_rate_changes enable row level security;
alter table public.loan_mode_changes enable row level security;
alter table public.loan_adjustments  enable row level security;

create policy "loans: read own" on public.loans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "loans: insert own" on public.loans
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.balance_items i
      where i.id = item_id and i.user_id = (select auth.uid()) and i.category = 'loan'
    )
  );
create policy "loans: update own" on public.loans
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.balance_items i
      where i.id = item_id and i.user_id = (select auth.uid()) and i.category = 'loan'
    )
  );

-- 三張還款資料表的規則相同：讀寫自己的，而且 loan_id 必須是自己的貸款；可以刪除（修正輸入錯誤）
do $$
declare
  t text;
begin
  foreach t in array array['loan_rate_changes', 'loan_mode_changes', 'loan_adjustments'] loop
    execute format(
      'create policy "%1$s: read own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check (
         user_id = (select auth.uid())
         and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = (select auth.uid())))', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (
           user_id = (select auth.uid())
           and exists (select 1 from public.loans l where l.id = loan_id and l.user_id = (select auth.uid())))', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- =============================================================
-- 資料表權限
-- =============================================================
revoke all on public.loans, public.loan_rate_changes, public.loan_mode_changes, public.loan_adjustments
  from anon, authenticated;
grant select, insert, update on public.loans to authenticated;
grant select, insert, update, delete on public.loan_rate_changes, public.loan_mode_changes, public.loan_adjustments
  to authenticated;
-- 每日快照要用還款資料算出當天的餘額
grant select on public.loans, public.loan_rate_changes, public.loan_mode_changes, public.loan_adjustments
  to service_role;

-- =============================================================
-- 由前端呼叫：新增一筆貸款（項目、貸款、第一筆利率與還款方式在同一個交易內完成）
-- p_item_id 有給時，是把原本手動輸入的「貸款」項目轉成自動計算，保留原本的項目與快照歷史
-- =============================================================
create or replace function public.create_loan(
  p_name               text,
  p_currency           char(3),
  p_start_date         date,
  p_principal          numeric,
  p_first_payment_date date,
  p_annual_rate        numeric,
  p_mode               text,
  p_term_months        integer,
  p_interest_every     integer,
  p_item_id            uuid default null,
  p_sort_order         integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
  v_loan uuid;
begin
  if p_item_id is null then
    insert into public.balance_items (kind, category, name, currency, amount, source_type, sort_order)
    values ('liability', 'loan', p_name, p_currency, p_principal, 'loan', p_sort_order)
    returning id into v_item;
  else
    update public.balance_items
    set source_type = 'loan', name = p_name, currency = p_currency
    where id = p_item_id and category = 'loan' and source_type = 'manual' and status = 'active'
    returning id into v_item;
    if v_item is null then
      raise exception '找不到可以轉換的貸款項目';
    end if;
  end if;

  insert into public.loans (item_id, start_date, principal, first_payment_date)
  values (v_item, p_start_date, p_principal, p_first_payment_date)
  returning id into v_loan;

  insert into public.loan_rate_changes (loan_id, effective_date, annual_rate)
  values (v_loan, p_start_date, p_annual_rate);

  insert into public.loan_mode_changes (loan_id, effective_date, mode, term_months, interest_every)
  values (v_loan, p_start_date, p_mode, p_term_months, p_interest_every);

  return v_loan;
end;
$$;

revoke execute on function public.create_loan from public, anon;
grant execute on function public.create_loan to authenticated;

-- =============================================================
-- 備份還原：加上貸款資料（舊版備份沒有這幾個欄位，視為沒有貸款）
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
  v_loans int;
begin
  if v_user is null then
    raise exception '需要登入才能還原';
  end if;
  if p_backup ->> 'format' is distinct from 'personal-wealth-tracker-backup' then
    raise exception '不是本 App 的備份檔';
  end if;

  -- 先清掉自己的資料（修改紀錄、快照明細、貸款與還款資料會跟著 cascade 刪除）
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

  insert into public.loans (id, user_id, item_id, start_date, principal, first_payment_date, created_at, updated_at)
  select l.id, v_user, l.item_id, l.start_date, l.principal, l.first_payment_date,
    coalesce(l.created_at, now()), coalesce(l.updated_at, now())
  from jsonb_to_recordset(coalesce(p_backup -> 'data' -> 'loans', '[]'::jsonb)) as l(
    id uuid, item_id uuid, start_date date, principal numeric, first_payment_date date,
    created_at timestamptz, updated_at timestamptz
  )
  -- 還原以 security definer 執行，不經過 RLS：只接受掛在自己項目底下的貸款
  where exists (select 1 from public.balance_items i where i.id = l.item_id and i.user_id = v_user);
  get diagnostics v_loans = row_count;

  insert into public.loan_rate_changes (id, user_id, loan_id, effective_date, annual_rate, created_at)
  select r.id, v_user, r.loan_id, r.effective_date, r.annual_rate, coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(p_backup -> 'data' -> 'loanRateChanges', '[]'::jsonb)) as r(
    id uuid, loan_id uuid, effective_date date, annual_rate numeric, created_at timestamptz
  )
  where exists (select 1 from public.loans l where l.id = r.loan_id and l.user_id = v_user);

  insert into public.loan_mode_changes
    (id, user_id, loan_id, effective_date, mode, term_months, interest_every, created_at)
  select m.id, v_user, m.loan_id, m.effective_date, m.mode, m.term_months, m.interest_every,
    coalesce(m.created_at, now())
  from jsonb_to_recordset(coalesce(p_backup -> 'data' -> 'loanModeChanges', '[]'::jsonb)) as m(
    id uuid, loan_id uuid, effective_date date, mode text, term_months int, interest_every int,
    created_at timestamptz
  )
  where exists (select 1 from public.loans l where l.id = m.loan_id and l.user_id = v_user);

  insert into public.loan_adjustments (id, user_id, loan_id, adjust_date, kind, amount, keep, note, created_at)
  select a.id, v_user, a.loan_id, a.adjust_date, a.kind, a.amount, coalesce(a.keep, 'term'), a.note,
    coalesce(a.created_at, now())
  from jsonb_to_recordset(coalesce(p_backup -> 'data' -> 'loanAdjustments', '[]'::jsonb)) as a(
    id uuid, loan_id uuid, adjust_date date, kind text, amount numeric, keep text, note text,
    created_at timestamptz
  )
  where exists (select 1 from public.loans l where l.id = a.loan_id and l.user_id = v_user);

  if p_backup -> 'data' -> 'settings' is not null and jsonb_typeof(p_backup -> 'data' -> 'settings') = 'object' then
    update public.user_settings set
      hide_amounts = coalesce((p_backup -> 'data' -> 'settings' ->> 'hide_amounts')::boolean, hide_amounts),
      cost_method  = coalesce(p_backup -> 'data' -> 'settings' ->> 'cost_method', cost_method)
    where user_id = v_user;
  end if;

  return jsonb_build_object('items', v_items, 'snapshots', v_snapshots, 'loans', v_loans);
end;
$$;

revoke execute on function public.restore_backup from public, anon;
grant execute on function public.restore_backup to authenticated;
