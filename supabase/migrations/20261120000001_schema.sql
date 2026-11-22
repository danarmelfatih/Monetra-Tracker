-- =====================================================================
-- FAMILY FINANCE TRACKER - MIGRATION 1: SCHEMA
-- Jalankan di Supabase SQL Editor (urutan: file 1 dulu, lalu file 2)
-- =====================================================================

-- Schema privat untuk fungsi helper (tidak terekspos sebagai API)
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type public.family_role         as enum ('owner', 'admin', 'member');
create type public.member_status       as enum ('active', 'removed');
create type public.invitation_status   as enum ('pending', 'accepted', 'cancelled', 'expired');
create type public.wallet_type         as enum ('cash', 'bank', 'ewallet', 'savings', 'other');
create type public.transaction_type    as enum ('income', 'expense');
create type public.visibility_type     as enum ('private', 'shared');
create type public.recurring_method    as enum ('automatic', 'reminder');
create type public.recurring_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');
create type public.budget_period       as enum ('monthly', 'custom');

-- ---------------------------------------------------------------------
-- TRIGGER FUNCTIONS UMUM
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Naikkan version tiap update + kunci kolom yang tidak boleh berubah.
-- Klien memakai: update ... where id = X and version = <versi terakhir yang dilihat>
-- Jika 0 baris terubah => ada konflik.
create function public.bump_version()
returns trigger language plpgsql set search_path = '' as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
begin
  foreach k in array array['family_id', 'created_by', 'owner_id'] loop
    if (o ? k) and (o->>k) is distinct from (n->>k) then
      raise exception 'Kolom % tidak boleh diubah', k;
    end if;
  end loop;
  new.version    = old.version + 1;
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Buat profil otomatis saat user pertama kali login Google
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. FAMILIES
-- ---------------------------------------------------------------------
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_families_updated before update on public.families
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. FAMILY MEMBERS
-- ---------------------------------------------------------------------
create table public.family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.family_role   not null default 'member',
  status      public.member_status not null default 'active',
  joined_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (family_id, user_id)
);
-- Maksimal satu owner aktif per keluarga
create unique index uq_one_active_owner
  on public.family_members (family_id)
  where role = 'owner' and status = 'active';
create index idx_family_members_user on public.family_members (user_id) where status = 'active';
create trigger trg_family_members_updated before update on public.family_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. FAMILY INVITATIONS (token disimpan sebagai hash, bukan teks asli)
-- ---------------------------------------------------------------------
create table public.family_invitations (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  email        text not null,
  role         public.family_role not null default 'member' check (role <> 'owner'),
  token_hash   text not null unique,
  status       public.invitation_status not null default 'pending',
  invited_by   uuid not null references public.profiles(id),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_by  uuid references public.profiles(id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_invitations_family on public.family_invitations (family_id);
create index idx_invitations_email  on public.family_invitations (lower(email));

-- ---------------------------------------------------------------------
-- 5. WALLETS (dompet pribadi, satu pemilik)
-- ---------------------------------------------------------------------
create table public.wallets (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id),
  name             text not null check (length(trim(name)) between 1 and 100),
  type             public.wallet_type not null default 'cash',
  initial_balance  numeric(19,2) not null default 0,
  is_archived      boolean not null default false,
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_wallets_owner  on public.wallets (owner_id);
create index idx_wallets_family on public.wallets (family_id);
create trigger trg_wallets_version before update on public.wallets
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------
-- 6. CATEGORIES
-- ---------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  type         public.transaction_type not null,
  icon         text,
  color        text,
  is_default   boolean not null default false,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_categories_family on public.categories (family_id);
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. TRANSACTIONS
-- id boleh dibuat oleh klien (UUID) agar bisa dibuat saat offline.
-- client_op_id unik => kirim ulang tidak membuat transaksi ganda.
-- ---------------------------------------------------------------------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete cascade,
  wallet_id         uuid not null references public.wallets(id) on delete restrict,
  category_id       uuid references public.categories(id) on delete restrict,
  created_by        uuid not null references public.profiles(id),
  type              public.transaction_type not null,
  title             text not null check (length(trim(title)) between 1 and 200),
  amount            numeric(19,2) not null check (amount > 0),
  transaction_date  date not null default current_date,  -- tipe date: tidak kena masalah zona waktu
  note              text,
  visibility        public.visibility_type not null default 'private',
  version           integer not null default 1,
  client_op_id      uuid unique,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_tx_family_date on public.transactions (family_id, transaction_date desc) where deleted_at is null;
create index idx_tx_wallet      on public.transactions (wallet_id) where deleted_at is null;
create index idx_tx_creator     on public.transactions (created_by);
create index idx_tx_category    on public.transactions (category_id);
create index idx_tx_updated     on public.transactions (family_id, updated_at); -- untuk delta sync
create trigger trg_transactions_version before update on public.transactions
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------
-- 8. TRANSFERS (bukan income/expense)
-- ---------------------------------------------------------------------
create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  from_wallet_id  uuid not null references public.wallets(id) on delete restrict,
  to_wallet_id    uuid not null references public.wallets(id) on delete restrict,
  created_by      uuid not null references public.profiles(id),
  amount          numeric(19,2) not null check (amount > 0),
  transfer_date   date not null default current_date,
  note            text,
  version         integer not null default 1,
  client_op_id    uuid unique,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (from_wallet_id <> to_wallet_id)
);
create index idx_transfers_from on public.transfers (from_wallet_id) where deleted_at is null;
create index idx_transfers_to   on public.transfers (to_wallet_id)   where deleted_at is null;
create trigger trg_transfers_version before update on public.transfers
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------
-- 9. BUDGETS
-- ---------------------------------------------------------------------
create table public.budgets (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete restrict,
  member_id        uuid references public.profiles(id),
  name             text not null,
  amount_limit     numeric(19,2) not null check (amount_limit > 0),
  period_type      public.budget_period not null default 'monthly',
  start_date       date not null,
  end_date         date not null,
  alert_threshold  integer not null default 80 check (alert_threshold between 1 and 100),
  is_archived      boolean not null default false,
  created_by       uuid not null references public.profiles(id),
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_budgets_family on public.budgets (family_id);
create trigger trg_budgets_version before update on public.budgets
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------
-- 10. RECURRING TRANSACTIONS
-- ---------------------------------------------------------------------
create table public.recurring_transactions (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families(id) on delete cascade,
  wallet_id      uuid not null references public.wallets(id) on delete restrict,
  category_id    uuid references public.categories(id) on delete restrict,
  created_by     uuid not null references public.profiles(id),
  type           public.transaction_type not null,
  title          text not null,
  amount         numeric(19,2) not null check (amount > 0),
  note           text,
  visibility     public.visibility_type not null default 'private',
  method         public.recurring_method not null default 'automatic',
  frequency      public.recurring_frequency not null,
  start_date     date not null,
  end_date       date,
  next_run_date  date not null,
  is_active      boolean not null default true,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index idx_recurring_due on public.recurring_transactions (next_run_date) where is_active;
create trigger trg_recurring_version before update on public.recurring_transactions
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------
-- 11. RECURRING EXECUTIONS (unique => tidak bisa jalan 2x untuk jadwal sama)
-- ---------------------------------------------------------------------
create table public.recurring_executions (
  id               uuid primary key default gen_random_uuid(),
  recurring_id     uuid not null references public.recurring_transactions(id) on delete cascade,
  scheduled_for    date not null,
  transaction_id   uuid references public.transactions(id) on delete set null,
  status           text not null default 'done' check (status in ('done', 'reminder', 'failed')),
  created_at       timestamptz not null default now(),
  unique (recurring_id, scheduled_for)
);

-- ---------------------------------------------------------------------
-- 12. AUDIT LOGS
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid references public.families(id) on delete cascade,
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz not null default now()
);
create index idx_audit_family_time on public.audit_logs (family_id, created_at desc);

-- ---------------------------------------------------------------------
-- 13. DEVICE SYNC
-- ---------------------------------------------------------------------
create table public.device_sync (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  device_id       text not null,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, device_id)
);
create trigger trg_device_sync_updated before update on public.device_sync
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- VIEW SALDO DOMPET (ledger: saldo awal + transaksi + transfer)
-- security_invoker => RLS pemanggil tetap berlaku
-- ---------------------------------------------------------------------
create view public.wallet_balances
with (security_invoker = true) as
select
  w.id        as wallet_id,
  w.family_id,
  w.owner_id,
  w.initial_balance
    + coalesce((select sum(case t.type when 'income' then t.amount else -t.amount end)
                from public.transactions t
                where t.wallet_id = w.id and t.deleted_at is null), 0)
    + coalesce((select sum(x.amount) from public.transfers x
                where x.to_wallet_id = w.id and x.deleted_at is null), 0)
    - coalesce((select sum(x.amount) from public.transfers x
                where x.from_wallet_id = w.id and x.deleted_at is null), 0)
    as balance
from public.wallets w;