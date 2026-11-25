-- =====================================================================
-- FAMILY FINANCE - MIGRATION 3: FAMILY BALANCE VIEWS & REPORT VIEW
-- Family main/savings balances are separated. External savings deposits
-- are reportable as income exactly once via the controlled view.
-- =====================================================================

begin;

create or replace view public.family_main_balances
with (security_invoker = true) as
select
  w.id as wallet_id,
  w.family_id,
  w.initial_balance
  + coalesce((
      select sum(case t.type when 'income' then t.amount else -t.amount end)
      from public.transactions t
      where t.wallet_id = w.id
        and t.deleted_at is null
    ), 0)
  - coalesce((
      select sum(s.amount)
      from public.savings_ledger s
      where s.main_wallet_id = w.id
        and s.kind = 'deposit_internal'
        and s.deleted_at is null
    ), 0)
  + coalesce((
      select sum(s.amount)
      from public.savings_ledger s
      where s.main_wallet_id = w.id
        and s.kind = 'withdraw_internal'
        and s.deleted_at is null
    ), 0)
  as balance
from public.wallets w
where w.scope = 'family_main'
  and w.is_archived = false;

create or replace view public.family_savings_balances
with (security_invoker = true) as
select
  w.id as wallet_id,
  w.family_id,
  w.initial_balance
  + coalesce((
      select sum(case s.kind
        when 'deposit_internal' then s.amount
        when 'deposit_external' then s.amount
        when 'withdraw_internal' then -s.amount
      end)
      from public.savings_ledger s
      where s.savings_wallet_id = w.id
        and s.deleted_at is null
    ), 0)
  as balance
from public.wallets w
where w.scope = 'family_savings'
  and w.is_archived = false;

create or replace view public.family_income_report_entries
with (security_invoker = true) as
select
  t.id as source_id,
  'transaction'::text as source_kind,
  t.family_id,
  t.created_by,
  t.transaction_date as entry_date,
  t.amount,
  t.title,
  t.category_id,
  t.note,
  t.wallet_id as destination_wallet_id,
  'family_main'::text as destination_scope
from public.transactions t
join public.wallets w on w.id = t.wallet_id
where t.deleted_at is null
  and t.type = 'income'
  and w.scope = 'family_main'

union all

select
  s.id as source_id,
  'savings_ledger'::text as source_kind,
  s.family_id,
  s.created_by,
  s.entry_date,
  s.amount,
  coalesce(nullif(btrim(s.note), ''), 'Setoran tabungan (eksternal)') as title,
  s.category_id,
  s.note,
  s.savings_wallet_id as destination_wallet_id,
  'family_savings'::text as destination_scope
from public.savings_ledger s
where s.deleted_at is null
  and s.kind = 'deposit_external';

revoke all on public.family_main_balances from anon;
revoke all on public.family_savings_balances from anon;
revoke all on public.family_income_report_entries from anon;
grant select on public.family_main_balances to authenticated;
grant select on public.family_savings_balances to authenticated;
grant select on public.family_income_report_entries to authenticated;

commit;
