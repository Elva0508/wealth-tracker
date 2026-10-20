-- =============================================================
-- Personal Wealth Tracker — 分類改成三層：大類 → 分類 → 細項
--
-- 大類（流動資金、投資、固定資產、應收款、負債）由分類推算，不存在資料庫；
-- balance_items.category 換成新的分類代碼，另外新增 subtype 存第三層細項（可留空）。
--
-- 舊分類對應：現金與銀行存款 → 銀行帳戶、股票與 ETF → 股票、其他資產 → 其他投資、
--            貸款 → 貸款、日常負債 → 其他負債
-- 清單與 core/balance.ts 的 GROUP_CATEGORIES、LEGACY_CATEGORIES 一致。
-- =============================================================

alter table public.balance_items drop constraint balance_items_kind_category;

-- 轉換既有資料時暫停 trigger：分類代碼改名不是使用者的修改，不寫入修改紀錄、不更新 updated_at
alter table public.balance_items disable trigger balance_items_log_changes;
alter table public.balance_items disable trigger balance_items_updated_at;

update public.balance_items set category = case category
  when 'cash_bank' then 'bank'
  when 'securities' then 'stock'
  when 'other_asset' then 'investment_other'
  when 'daily_liability' then 'liability_other'
  else category
end
where category in ('cash_bank', 'securities', 'other_asset', 'daily_liability');

alter table public.balance_items enable trigger balance_items_log_changes;
alter table public.balance_items enable trigger balance_items_updated_at;

-- 快照明細也換成新代碼，之後依分類統計歷史資料時才對得上
update public.snapshot_lines set category = case category
  when 'cash_bank' then 'bank'
  when 'securities' then 'stock'
  when 'other_asset' then 'investment_other'
  when 'daily_liability' then 'liability_other'
  else category
end
where category in ('cash_bank', 'securities', 'other_asset', 'daily_liability');

-- 修改紀錄裡的分類變更也一併換成新代碼
update public.balance_item_changes set
  old_value = case old_value when 'cash_bank' then 'bank' when 'securities' then 'stock'
    when 'other_asset' then 'investment_other' when 'daily_liability' then 'liability_other' else old_value end,
  new_value = case new_value when 'cash_bank' then 'bank' when 'securities' then 'stock'
    when 'other_asset' then 'investment_other' when 'daily_liability' then 'liability_other' else new_value end
where field = 'category';

alter table public.balance_items add constraint balance_items_kind_category check (
  (kind = 'asset' and category in (
    'cash', 'ewallet', 'bank', 'liquid_other',
    'fund', 'stock', 'crypto', 'metal', 'investment_other',
    'real_estate', 'fixed_other',
    'lending', 'receivable_other'
  ))
  or (kind = 'liability' and category in ('credit_card', 'loan', 'payable', 'liability_other'))
);

-- 第三層細項，例如電子錢包的 jkopay、貸款的 student。選項清單在 core/balance.ts 的 CATEGORY_SUBTYPES
alter table public.balance_items add column subtype text check (char_length(subtype) <= 40);

-- =============================================================
-- create_loan：多一個 p_subtype（房屋貸款、學貸…）
-- 參數變了，先刪掉舊的版本，避免留下兩個同名函式
-- =============================================================
drop function public.create_loan(text, char, date, numeric, date, numeric, text, integer, integer, uuid, integer);

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
  p_sort_order         integer default 0,
  p_subtype            text default null
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
    insert into public.balance_items (kind, category, subtype, name, currency, amount, source_type, sort_order)
    values ('liability', 'loan', p_subtype, p_name, p_currency, p_principal, 'loan', p_sort_order)
    returning id into v_item;
  else
    update public.balance_items
    set source_type = 'loan', name = p_name, currency = p_currency, subtype = coalesce(p_subtype, subtype)
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
-- 備份還原：還原 subtype，舊版備份的分類代碼換成新分類
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
    (id, user_id, kind, category, subtype, name, currency, amount, notes, source_type, status,
     archived_at, converted_to_id, sort_order, created_at, updated_at)
  select
    -- 舊版備份的分類代碼換成新分類（前端已經先換過，這裡再保險一次）
    i.id, v_user, i.kind,
    case i.category
      when 'cash_bank' then 'bank' when 'securities' then 'stock'
      when 'other_asset' then 'investment_other' when 'daily_liability' then 'liability_other'
      else i.category end,
    i.subtype, i.name, i.currency, i.amount, i.notes,
    coalesce(i.source_type, 'manual'), i.status, i.archived_at, i.converted_to_id,
    coalesce(i.sort_order, 0), coalesce(i.created_at, now()), coalesce(i.updated_at, now())
  from jsonb_to_recordset(p_backup -> 'data' -> 'items') as i(
    id uuid, kind text, category text, subtype text, name text, currency char(3), amount numeric, notes text,
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
  select l.snapshot_id, v_user, l.item_id,
    case l.category
      when 'cash_bank' then 'bank' when 'securities' then 'stock'
      when 'other_asset' then 'investment_other' when 'daily_liability' then 'liability_other'
      else l.category end,
    l.currency, l.amount, l.fx_rate, l.amount_base
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
