-- =====================================================================
-- FAMILY FINANCE - MIGRATION 1: WALLET SCOPE & FAMILY WALLET PROVISIONING
-- Additive. Safe for existing data. Does not edit old migrations.
-- =====================================================================

begin;

do $$ begin
  create type public.wallet_scope as enum ('family_main', 'family_savings', 'legacy_personal');
exception when duplicate_object then null; end $$;

alter table public.wallets
  add column if not exists scope public.wallet_scope not null default 'legacy_personal';

alter table public.wallets alter column owner_id drop not null;

do $$ begin
  alter table public.wallets
    add constraint wallets_owner_scope_ck
    check (
      (scope = 'legacy_personal' and owner_id is not null)
      or (scope in ('family_main', 'family_savings') and owner_id is null)
    );
exception when duplicate_object then null; end $$;

create unique index if not exists wallets_one_family_main_idx
  on public.wallets (family_id)
  where scope = 'family_main' and is_archived = false;

create unique index if not exists wallets_one_family_savings_idx
  on public.wallets (family_id)
  where scope = 'family_savings' and is_archived = false;

create index if not exists wallets_family_scope_idx
  on public.wallets (family_id, scope)
  where is_archived = false;

update public.wallets
set scope = 'legacy_personal'
where scope is distinct from 'legacy_personal'
  and scope not in ('family_main', 'family_savings');

insert into public.wallets (family_id, owner_id, name, type, initial_balance, is_archived, scope)
select f.id, null, 'Dompet Utama Keluarga', 'cash', 0, false, 'family_main'
from public.families f
where not exists (
  select 1 from public.wallets w
  where w.family_id = f.id and w.scope = 'family_main' and w.is_archived = false
);

insert into public.wallets (family_id, owner_id, name, type, initial_balance, is_archived, scope)
select f.id, null, 'Tabungan Keluarga', 'savings', 0, false, 'family_savings'
from public.families f
where not exists (
  select 1 from public.wallets w
  where w.family_id = f.id and w.scope = 'family_savings' and w.is_archived = false
);

create or replace function public.create_family(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  v_id uuid;
begin
  if uid is null then raise exception 'Belum login'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nama keluarga wajib diisi';
  end if;

  insert into public.families (name, created_by) values (trim(p_name), uid)
  returning id into v_id;

  insert into public.family_members (family_id, user_id, role) values (v_id, uid, 'owner');

  insert into public.categories (family_id, name, type, icon, color, is_default)
  select v_id, c.name, c.type::public.transaction_type, c.icon, c.color, true
  from (values
    ('Gaji',          'income',  'briefcase',      '#16a34a'),
    ('Bisnis',        'income',  'store',          '#0d9488'),
    ('Investasi',     'income',  'trending-up',    '#2563eb'),
    ('Bonus',         'income',  'gift',           '#ca8a04'),
    ('Hadiah',        'income',  'party-popper',   '#db2777'),
    ('Lainnya',       'income',  'circle-ellipsis','#64748b'),
    ('Makanan',       'expense', 'utensils',       '#ea580c'),
    ('Transportasi',  'expense', 'car',            '#0284c7'),
    ('Belanja',       'expense', 'shopping-bag',   '#c026d3'),
    ('Tagihan',       'expense', 'receipt',        '#dc2626'),
    ('Pendidikan',    'expense', 'graduation-cap', '#4f46e5'),
    ('Kesehatan',     'expense', 'heart-pulse',    '#e11d48'),
    ('Hiburan',       'expense', 'clapperboard',   '#7c3aed'),
    ('Rumah tangga',  'expense', 'house',          '#b45309'),
    ('Lainnya',       'expense', 'circle-ellipsis','#64748b')
  ) as c(name, type, icon, color);

  insert into public.wallets (family_id, owner_id, name, type, initial_balance, is_archived, scope)
  values
    (v_id, null, 'Dompet Utama Keluarga', 'cash', 0, false, 'family_main'),
    (v_id, null, 'Tabungan Keluarga', 'savings', 0, false, 'family_savings')
  on conflict do nothing;

  return v_id;
end $$;

revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

commit;
