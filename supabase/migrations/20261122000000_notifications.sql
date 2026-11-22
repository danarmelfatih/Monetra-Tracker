create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  href text,
  source_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc)
  where deleted_at is null;

create unique index if not exists notifications_source_unique
  on public.notifications (recipient_user_id, type, source_id)
  where source_id is not null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

grant select, update on public.notifications to authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke all on public.notifications from anon;

create or replace function private.notify_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_actor text;
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.type not in ('income', 'expense') or new.deleted_at is not null then
    return null;
  end if;

  select fm.user_id into v_owner
  from public.family_members fm
  where fm.family_id = new.family_id
    and fm.role = 'owner'
    and fm.status = 'active'
  order by fm.joined_at
  limit 1;

  if v_owner is null then return null; end if;

  select coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Anggota') into v_actor
  from public.profiles p
  where p.id = new.created_by;

  v_actor := coalesce(v_actor, 'Anggota');
  v_kind := case when new.type = 'income' then 'pemasukan' else 'pengeluaran' end;
  v_title := case when new.type = 'income' then 'Pemasukan baru' else 'Pengeluaran baru' end;
  v_body := format(
    '%s mencatat %s: %s (%s)',
    v_actor,
    v_kind,
    coalesce(new.title, 'Transaksi'),
    new.amount::text
  );

  insert into public.notifications (family_id, recipient_user_id, type, title, body, href, source_id)
  values (new.family_id, v_owner, 'transaction_' || new.type::text, v_title, v_body, '/transactions', new.id)
  on conflict do nothing;

  return null;
end $$;

create or replace function private.notify_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_actor text;
  v_name text;
begin
  if new.status <> 'active' or new.role = 'owner' then return null; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' then return null; end if;
  end if;

  select fm.user_id into v_owner
  from public.family_members fm
  where fm.family_id = new.family_id
    and fm.role = 'owner'
    and fm.status = 'active'
  order by fm.joined_at
  limit 1;

  if v_owner is null or v_owner = new.user_id then return null; end if;

  select coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Anggota baru') into v_name
  from public.profiles p
  where p.id = new.user_id;

  select coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Seseorang') into v_actor
  from public.profiles p
  where p.id = (select auth.uid());

  v_name := coalesce(v_name, 'Anggota baru');
  v_actor := coalesce(v_actor, 'Seseorang');

  insert into public.notifications (family_id, recipient_user_id, type, title, body, href, source_id)
  values (
    new.family_id,
    v_owner,
    'member_added',
    'Anggota baru',
    format('%s menambahkan %s ke keluarga', v_actor, v_name),
    '/family/members',
    new.id
  )
  on conflict do nothing;

  return null;
end $$;

revoke all on function private.notify_transaction() from public, anon, authenticated;
revoke all on function private.notify_member_added() from public, anon, authenticated;

drop trigger if exists trg_notify_transactions on public.transactions;
create trigger trg_notify_transactions after insert on public.transactions
  for each row execute function private.notify_transaction();

drop trigger if exists trg_notify_members on public.family_members;
create trigger trg_notify_members after insert or update of status on public.family_members
  for each row execute function private.notify_member_added();
