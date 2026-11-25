-- =====================================================================
-- FAMILY FINANCE - MIGRATION 2: SAVINGS LEDGER
-- Source of truth for family savings mutations.
-- =====================================================================

begin;

do $$ begin
  create type public.savings_entry_kind as enum ('deposit_internal', 'deposit_external', 'withdraw_internal');
exception when duplicate_object then null; end $$;

create table if not exists public.savings_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  main_wallet_id uuid not null references public.wallets(id) on delete restrict,
  savings_wallet_id uuid not null references public.wallets(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  kind public.savings_entry_kind not null,
  amount numeric(19,2) not null check (amount > 0),
  entry_date date not null default current_date,
  note text,
  client_op_id uuid unique,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_ledger_category_ck check (
    (kind = 'deposit_external' and category_id is not null)
    or (kind in ('deposit_internal', 'withdraw_internal'))
  )
);

create index if not exists savings_ledger_family_date_idx
  on public.savings_ledger (family_id, entry_date desc, created_at desc)
  where deleted_at is null;
create index if not exists savings_ledger_main_idx
  on public.savings_ledger (main_wallet_id)
  where deleted_at is null;
create index if not exists savings_ledger_savings_idx
  on public.savings_ledger (savings_wallet_id)
  where deleted_at is null;
create index if not exists savings_ledger_creator_idx
  on public.savings_ledger (created_by);

drop trigger if exists trg_savings_ledger_version on public.savings_ledger;
create trigger trg_savings_ledger_version before update on public.savings_ledger
  for each row execute function public.bump_version();

drop trigger if exists trg_audit_savings_ledger on public.savings_ledger;
create trigger trg_audit_savings_ledger after insert or update or delete on public.savings_ledger
  for each row execute function private.audit();

alter table public.savings_ledger enable row level security;

revoke all on public.savings_ledger from anon;
grant select on public.savings_ledger to authenticated;
revoke insert, update, delete on public.savings_ledger from anon, authenticated;

commit;
