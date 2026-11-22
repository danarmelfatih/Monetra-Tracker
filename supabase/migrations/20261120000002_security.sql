-- =====================================================================
-- FAMILY FINANCE TRACKER - MIGRATION 2: FUNGSI, RLS, KEAMANAN
-- Jalankan SETELAH file 1 berhasil.
-- =====================================================================

-- ---------------------------------------------------------------------
-- HELPER (security definer => membaca tabel tanpa memicu RLS rekursif)
-- ---------------------------------------------------------------------
create function private.is_member(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = (select auth.uid()) and status = 'active'
  );
$$;

create function private.is_admin(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = (select auth.uid()) and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

create function private.is_owner(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = (select auth.uid()) and status = 'active'
      and role = 'owner'
  );
$$;

-- Apakah user lain berada di keluarga yang sama dengan saya?
create function private.shares_family(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.family_members a
    join public.family_members b on a.family_id = b.family_id
    where a.user_id = (select auth.uid()) and a.status = 'active'
      and b.user_id = uid and b.status = 'active'
  );
$$;

-- Dompet milik user X dan berada di keluarga F?
create function private.wallet_ok(wid uuid, fid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wallets
    where id = wid and family_id = fid and owner_id = uid
  );
$$;

create function private.owns_wallet(wid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wallets
    where id = wid and owner_id = (select auth.uid())
  );
$$;

create function private.category_ok(cid uuid, fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select cid is null or exists (
    select 1 from public.categories where id = cid and family_id = fid
  );
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------
-- RPC: BUAT KELUARGA (sekaligus jadi owner + kategori default)
-- ---------------------------------------------------------------------
create function public.create_family(p_name text)
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

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: BUAT UNDANGAN (mengembalikan token asli SEKALI; yang disimpan hanya hash)
-- Pengiriman email dilakukan Edge Function pada tahap berikutnya.
-- ---------------------------------------------------------------------
create function public.create_invitation(
  p_family_id uuid, p_email text, p_role public.family_role default 'member'
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := (select auth.uid());
  v_token text;
  v_email text := lower(trim(p_email));
begin
  if not private.is_admin(p_family_id) then
    raise exception 'Hanya owner/admin yang boleh mengundang';
  end if;
  if p_role = 'owner' then raise exception 'Tidak bisa mengundang sebagai owner'; end if;
  if p_role = 'admin' and not private.is_owner(p_family_id) then
    raise exception 'Hanya owner yang boleh mengundang admin';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email tidak valid';
  end if;

  -- batalkan undangan pending lama untuk email yang sama
  update public.family_invitations
     set status = 'cancelled'
   where family_id = p_family_id and lower(email) = v_email and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.family_invitations (family_id, email, role, token_hash, invited_by)
  values (p_family_id, v_email, p_role,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), uid);

  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- RPC: TERIMA UNDANGAN (sekali pakai, ada masa berlaku, email harus cocok)
-- ---------------------------------------------------------------------
create function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := (select auth.uid());
  v_mail text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  inv    public.family_invitations;
begin
  if uid is null then raise exception 'Belum login'; end if;

  select * into inv
  from public.family_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or inv.status <> 'pending' then
    raise exception 'Undangan tidak valid atau sudah digunakan';
  end if;
  if inv.expires_at < now() then
    update public.family_invitations set status = 'expired' where id = inv.id;
    raise exception 'Undangan sudah kedaluwarsa';
  end if;
  if lower(inv.email) <> v_mail then
    raise exception 'Undangan ini ditujukan untuk email lain';
  end if;

  insert into public.family_members (family_id, user_id, role, status)
  values (inv.family_id, uid, inv.role, 'active')
  on conflict (family_id, user_id)
  do update set role = excluded.role, status = 'active';

  update public.family_invitations
     set status = 'accepted', accepted_by = uid, accepted_at = now()
   where id = inv.id;

  return inv.family_id;
end $$;

revoke execute on function public.create_family(text) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.family_role) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant  execute on function public.create_family(text) to authenticated;
grant  execute on function public.create_invitation(uuid, text, public.family_role) to authenticated;
grant  execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- AUDIT LOG (otomatis lewat trigger)
-- ---------------------------------------------------------------------
create function private.audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    (r->>'family_id')::uuid,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (r->>'id')::uuid,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

create trigger trg_audit_transactions  after insert or update or delete on public.transactions
  for each row execute function private.audit();
create trigger trg_audit_transfers     after insert or update or delete on public.transfers
  for each row execute function private.audit();
create trigger trg_audit_wallets       after insert or update or delete on public.wallets
  for each row execute function private.audit();
create trigger trg_audit_members       after insert or update or delete on public.family_members
  for each row execute function private.audit();
create trigger trg_audit_budgets       after insert or update or delete on public.budgets
  for each row execute function private.audit();

-- ---------------------------------------------------------------------
-- ENABLE RLS PADA SEMUA TABEL
-- ---------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.families                enable row level security;
alter table public.family_members          enable row level security;
alter table public.family_invitations      enable row level security;
alter table public.wallets                 enable row level security;
alter table public.categories              enable row level security;
alter table public.transactions            enable row level security;
alter table public.transfers               enable row level security;
alter table public.budgets                 enable row level security;
alter table public.recurring_transactions  enable row level security;
alter table public.recurring_executions    enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.device_sync             enable row level security;

-- ---------------------------------------------------------------------
-- POLICIES
-- Catatan: pola (select auth.uid()) dipakai agar dievaluasi sekali per query.
-- ---------------------------------------------------------------------

-- PROFILES: lihat diri sendiri + anggota keluarga yang sama; ubah hanya diri sendiri
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_family(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- FAMILIES: insert lewat create_family(); update nama hanya owner
create policy families_select on public.families for select to authenticated
  using (private.is_member(id));
create policy families_update on public.families for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));

-- FAMILY MEMBERS: lihat sesama anggota; owner mengubah role/status orang lain
create policy members_select on public.family_members for select to authenticated
  using (private.is_member(family_id));
create policy members_update on public.family_members for update to authenticated
  using (private.is_owner(family_id) and user_id <> (select auth.uid()))
  with check (private.is_owner(family_id) and role in ('admin', 'member'));

-- INVITATIONS: owner/admin melihat & membatalkan; buat/terima lewat RPC
create policy invitations_select on public.family_invitations for select to authenticated
  using (private.is_admin(family_id));
create policy invitations_cancel on public.family_invitations for update to authenticated
  using (private.is_admin(family_id)) with check (status = 'cancelled');

-- WALLETS: hanya pemilik (admin tidak otomatis melihat dompet anggota)
create policy wallets_select on public.wallets for select to authenticated
  using (owner_id = (select auth.uid()) and private.is_member(family_id));
create policy wallets_insert on public.wallets for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.is_member(family_id));
create policy wallets_update on public.wallets for update to authenticated
  using (owner_id = (select auth.uid()) and private.is_member(family_id))
  with check (owner_id = (select auth.uid()) and private.is_member(family_id));

-- CATEGORIES: semua anggota membaca; owner/admin mengelola
create policy categories_select on public.categories for select to authenticated
  using (private.is_member(family_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (private.is_admin(family_id));
create policy categories_update on public.categories for update to authenticated
  using (private.is_admin(family_id)) with check (private.is_admin(family_id));

-- TRANSACTIONS
--  lihat : shared, milik sendiri, atau (owner/admin) semuanya
--  buat  : harus atas nama sendiri, pakai dompet milik sendiri
--  ubah  : pembuat atau owner/admin (termasuk soft delete via deleted_at)
create policy tx_select on public.transactions for select to authenticated
  using (
    private.is_member(family_id)
    and (visibility = 'shared'
         or created_by = (select auth.uid())
         or private.is_admin(family_id))
  );
create policy tx_insert on public.transactions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_member(family_id)
    and private.wallet_ok(wallet_id, family_id, created_by)
    and private.category_ok(category_id, family_id)
  );
create policy tx_update on public.transactions for update to authenticated
  using (
    private.is_member(family_id)
    and (created_by = (select auth.uid()) or private.is_admin(family_id))
  )
  with check (
    private.is_member(family_id)
    and (created_by = (select auth.uid()) or private.is_admin(family_id))
    and private.wallet_ok(wallet_id, family_id, created_by)
    and private.category_ok(category_id, family_id)
  );
-- Tidak ada policy DELETE => hapus permanen tidak mungkin dari klien.

-- TRANSFERS: hanya antar dompet milik sendiri (MVP)
create policy transfers_select on public.transfers for select to authenticated
  using (private.owns_wallet(from_wallet_id) or private.owns_wallet(to_wallet_id));
create policy transfers_insert on public.transfers for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_member(family_id)
    and private.wallet_ok(from_wallet_id, family_id, created_by)
    and private.wallet_ok(to_wallet_id,   family_id, created_by)
  );
create policy transfers_update on public.transfers for update to authenticated
  using (created_by = (select auth.uid()) and private.is_member(family_id))
  with check (
    created_by = (select auth.uid())
    and private.wallet_ok(from_wallet_id, family_id, created_by)
    and private.wallet_ok(to_wallet_id,   family_id, created_by)
  );

-- BUDGETS: anggota membaca; owner/admin mengelola
create policy budgets_select on public.budgets for select to authenticated
  using (private.is_member(family_id));
create policy budgets_insert on public.budgets for insert to authenticated
  with check (
    private.is_admin(family_id)
    and created_by = (select auth.uid())
    and private.category_ok(category_id, family_id)
  );
create policy budgets_update on public.budgets for update to authenticated
  using (private.is_admin(family_id))
  with check (private.is_admin(family_id) and private.category_ok(category_id, family_id));

-- RECURRING: pembuat atau owner/admin
create policy recurring_select on public.recurring_transactions for select to authenticated
  using (private.is_member(family_id)
         and (created_by = (select auth.uid()) or private.is_admin(family_id)));
create policy recurring_insert on public.recurring_transactions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_member(family_id)
    and private.wallet_ok(wallet_id, family_id, created_by)
    and private.category_ok(category_id, family_id)
  );
create policy recurring_update on public.recurring_transactions for update to authenticated
  using (private.is_member(family_id)
         and (created_by = (select auth.uid()) or private.is_admin(family_id)))
  with check (
    private.is_member(family_id)
    and (created_by = (select auth.uid()) or private.is_admin(family_id))
    and private.wallet_ok(wallet_id, family_id, created_by)
    and private.category_ok(category_id, family_id)
  );

-- RECURRING EXECUTIONS: baca saja (ditulis oleh job server)
create policy executions_select on public.recurring_executions for select to authenticated
  using (exists (select 1 from public.recurring_transactions r where r.id = recurring_id));

-- AUDIT LOGS: hanya owner/admin, hanya baca
create policy audit_select on public.audit_logs for select to authenticated
  using (family_id is not null and private.is_admin(family_id));

-- DEVICE SYNC: milik sendiri
create policy device_sync_all on public.device_sync for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- GRANTS: anon (belum login) tidak boleh menyentuh tabel apa pun
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;