-- =============================================================
-- Personal Wealth Tracker — V1b 貸款：新增時一併記錄寬限期
--
-- 有寬限期的貸款在新增時就有兩筆還款方式：起算日起每月只繳息，寬限期結束後改成攤還。
-- 兩筆要在同一個交易內寫入，否則失敗時會留下一筆永遠只繳息的貸款，所以加進 create_loan。
-- 接在 20261022000000_categories.sql 之後（保留它加的 p_subtype）；新的參數都有預設值，舊的呼叫方式不受影響。
-- =============================================================

drop function public.create_loan(text, char, date, numeric, date, numeric, text, integer, integer, uuid, integer, text);

create function public.create_loan(
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
  p_subtype            text default null,
  -- 寬限期結束後改用的還款方式；沒有寬限期時都是 null
  p_next_date          date default null,
  p_next_mode          text default null,
  p_next_term_months   integer default null
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

  if p_next_mode is not null then
    if p_next_date is null or p_next_date <= p_start_date then
      raise exception '寬限期結束日要在起算日之後';
    end if;
    insert into public.loan_mode_changes (loan_id, effective_date, mode, term_months, interest_every)
    values (v_loan, p_next_date, p_next_mode, p_next_term_months, null);
  end if;

  return v_loan;
end;
$$;

revoke execute on function public.create_loan from public, anon;
grant execute on function public.create_loan to authenticated;
