-- =====================================================================
-- FAMILY FINANCE - MIGRATION 4: ATOMIC RPCS
-- Server-side validation, row locking, idempotency, rollback on failure.
-- =====================================================================

begin;

create or replace function private.get_family_wallets(p_family_id uuid)
returns table(main_id uuid, savings_id uuid)
language sql stable security definer set search_path = '' as $$
  select
    (select w.id from public.wallets w
     where w.family_id = p_family_id and w.scope = 'family_main' and w.is_archived = false
     limit 1),
    (select w.id from public.wallets w
     where w.family_id = p_family_id and w.scope = 'family_savings' and w.is_archived = false
     limit 1);
$$;

create or replace function private.family_main_balance(p_wallet_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select
    w.initial_balance
    + coalesce((
        select sum(case t.type when 'income' then t.amount else -t.amount end)
        from public.transactions t
        where t.wallet_id = w.id and t.deleted_at is null
      ), 0)
    - coalesce((
        select sum(s.amount) from public.savings_ledger s
        where s.main_wallet_id = w.id and s.kind = 'deposit_internal' and s.deleted_at is null
      ), 0)
    + coalesce((
        select sum(s.amount) from public.savings_ledger s
        where s.main_wallet_id = w.id and s.kind = 'withdraw_internal' and s.deleted_at is null
      ), 0)
  from public.wallets w
  where w.id = p_wallet_id;
$$;

create or replace function private.family_savings_balance(p_wallet_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select
    w.initial_balance
    + coalesce((
        select sum(case s.kind
          when 'deposit_internal' then s.amount
          when 'deposit_external' then s.amount
          when 'withdraw_internal' then -s.amount
        end)
        from public.savings_ledger s
        where s.savings_wallet_id = w.id and s.deleted_at is null
      ), 0)
  from public.wallets w
  where w.id = p_wallet_id;
$$;

create or replace function public.family_record_income(
  p_family_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_category_id uuid,
  p_title text,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'Judul wajib diisi'; end if;
  if p_category_id is not null and not private.category_ok(p_category_id, p_family_id) then
    raise exception 'Kategori tidak valid';
  end if;

  select main_id into v_main from private.get_family_wallets(p_family_id);
  if v_main is null then raise exception 'Dompet Utama Keluarga tidak ditemukan'; end if;

  perform 1 from public.wallets where id = v_main for update;

  if p_client_op_id is not null then
    insert into public.transactions (
      family_id, wallet_id, category_id, created_by, type, title, amount,
      transaction_date, note, visibility, client_op_id
    ) values (
      p_family_id, v_main, p_category_id, v_uid, 'income', btrim(p_title), p_amount,
      p_transaction_date, nullif(btrim(coalesce(p_note, '')), ''), 'shared', p_client_op_id
    )
    on conflict (client_op_id) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.transactions where client_op_id = p_client_op_id;
    end if;
  else
    insert into public.transactions (
      family_id, wallet_id, category_id, created_by, type, title, amount,
      transaction_date, note, visibility
    ) values (
      p_family_id, v_main, p_category_id, v_uid, 'income', btrim(p_title), p_amount,
      p_transaction_date, nullif(btrim(coalesce(p_note, '')), ''), 'shared'
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.family_record_expense(
  p_family_id uuid,
  p_amount numeric,
  p_transaction_date date,
  p_category_id uuid,
  p_title text,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_id uuid;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'Judul wajib diisi'; end if;
  if p_category_id is not null and not private.category_ok(p_category_id, p_family_id) then
    raise exception 'Kategori tidak valid';
  end if;

  select main_id into v_main from private.get_family_wallets(p_family_id);
  if v_main is null then raise exception 'Dompet Utama Keluarga tidak ditemukan'; end if;

  perform 1 from public.wallets where id = v_main for update;
  v_balance := private.family_main_balance(v_main);
  if v_balance < p_amount then
    raise exception 'Saldo Dompet Utama tidak cukup';
  end if;

  if p_client_op_id is not null then
    insert into public.transactions (
      family_id, wallet_id, category_id, created_by, type, title, amount,
      transaction_date, note, visibility, client_op_id
    ) values (
      p_family_id, v_main, p_category_id, v_uid, 'expense', btrim(p_title), p_amount,
      p_transaction_date, nullif(btrim(coalesce(p_note, '')), ''), 'shared', p_client_op_id
    )
    on conflict (client_op_id) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.transactions where client_op_id = p_client_op_id;
    end if;
  else
    insert into public.transactions (
      family_id, wallet_id, category_id, created_by, type, title, amount,
      transaction_date, note, visibility
    ) values (
      p_family_id, v_main, p_category_id, v_uid, 'expense', btrim(p_title), p_amount,
      p_transaction_date, nullif(btrim(coalesce(p_note, '')), ''), 'shared'
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.family_deposit_internal(
  p_family_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_savings uuid;
  v_id uuid;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;

  select main_id, savings_id into v_main, v_savings from private.get_family_wallets(p_family_id);
  if v_main is null or v_savings is null then raise exception 'Dompet keluarga tidak lengkap'; end if;

  perform 1 from public.wallets where id in (v_main, v_savings) order by id for update;
  v_balance := private.family_main_balance(v_main);
  if v_balance < p_amount then raise exception 'Saldo Dompet Utama tidak cukup'; end if;

  insert into public.savings_ledger (
    family_id, main_wallet_id, savings_wallet_id, created_by, kind, amount, entry_date, note, client_op_id
  ) values (
    p_family_id, v_main, v_savings, v_uid, 'deposit_internal', p_amount, p_entry_date,
    nullif(btrim(coalesce(p_note, '')), ''), p_client_op_id
  )
  on conflict (client_op_id) do nothing
  returning id into v_id;

  if v_id is null and p_client_op_id is not null then
    select id into v_id from public.savings_ledger where client_op_id = p_client_op_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.family_deposit_external(
  p_family_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_category_id uuid,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_savings uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_category_id is null then raise exception 'Kategori sumber dana wajib diisi'; end if;
  if not private.category_ok(p_category_id, p_family_id) then raise exception 'Kategori tidak valid'; end if;

  select main_id, savings_id into v_main, v_savings from private.get_family_wallets(p_family_id);
  if v_main is null or v_savings is null then raise exception 'Dompet keluarga tidak lengkap'; end if;

  perform 1 from public.wallets where id = v_savings for update;

  insert into public.savings_ledger (
    family_id, main_wallet_id, savings_wallet_id, category_id, created_by, kind, amount, entry_date, note, client_op_id
  ) values (
    p_family_id, v_main, v_savings, p_category_id, v_uid, 'deposit_external', p_amount, p_entry_date,
    nullif(btrim(coalesce(p_note, '')), ''), p_client_op_id
  )
  on conflict (client_op_id) do nothing
  returning id into v_id;

  if v_id is null and p_client_op_id is not null then
    select id into v_id from public.savings_ledger where client_op_id = p_client_op_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.family_withdraw_internal(
  p_family_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_savings uuid;
  v_id uuid;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;

  select main_id, savings_id into v_main, v_savings from private.get_family_wallets(p_family_id);
  if v_main is null or v_savings is null then raise exception 'Dompet keluarga tidak lengkap'; end if;

  perform 1 from public.wallets where id in (v_main, v_savings) order by id for update;
  v_balance := private.family_savings_balance(v_savings);
  if v_balance < p_amount then raise exception 'Saldo Tabungan tidak cukup'; end if;

  insert into public.savings_ledger (
    family_id, main_wallet_id, savings_wallet_id, created_by, kind, amount, entry_date, note, client_op_id
  ) values (
    p_family_id, v_main, v_savings, v_uid, 'withdraw_internal', p_amount, p_entry_date,
    nullif(btrim(coalesce(p_note, '')), ''), p_client_op_id
  )
  on conflict (client_op_id) do nothing
  returning id into v_id;

  if v_id is null and p_client_op_id is not null then
    select id into v_id from public.savings_ledger where client_op_id = p_client_op_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.family_update_transaction(
  p_transaction_id uuid,
  p_family_id uuid,
  p_type text,
  p_amount numeric,
  p_transaction_date date,
  p_category_id uuid,
  p_title text,
  p_note text,
  p_client_op_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_tx record;
  v_balance numeric;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;
  if p_type not in ('income', 'expense') then raise exception 'Tipe transaksi tidak valid'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'Judul wajib diisi'; end if;
  if p_category_id is not null and not private.category_ok(p_category_id, p_family_id) then
    raise exception 'Kategori tidak valid';
  end if;

  select main_id into v_main from private.get_family_wallets(p_family_id);
  if v_main is null then raise exception 'Dompet Utama Keluarga tidak ditemukan'; end if;

  perform 1 from public.wallets where id = v_main for update;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id and family_id = p_family_id and deleted_at is null
  for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_tx.wallet_id <> v_main then raise exception 'Transaksi bukan Dompet Utama Keluarga'; end if;
  if not (v_tx.created_by = v_uid or private.is_admin(p_family_id)) then
    raise exception 'Tidak memiliki akses edit transaksi ini';
  end if;

  if p_type = 'expense' then
    v_balance := private.family_main_balance(v_main);
    if v_tx.type = 'income' then
      v_balance := v_balance - v_tx.amount;
    elsif v_tx.type = 'expense' then
      v_balance := v_balance + v_tx.amount;
    end if;
    if v_balance < p_amount then raise exception 'Saldo Dompet Utama tidak cukup'; end if;
  end if;

  update public.transactions
  set
    type = p_type,
    amount = p_amount,
    transaction_date = p_transaction_date,
    category_id = p_category_id,
    title = btrim(p_title),
    note = nullif(btrim(coalesce(p_note, '')), ''),
    visibility = 'shared',
    client_op_id = coalesce(p_client_op_id, client_op_id)
  where id = p_transaction_id
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.family_delete_transaction(
  p_transaction_id uuid,
  p_family_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_main uuid;
  v_tx record;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Belum login'; end if;
  if not private.is_member(p_family_id) then raise exception 'Bukan anggota keluarga aktif'; end if;

  select main_id into v_main from private.get_family_wallets(p_family_id);
  if v_main is null then raise exception 'Dompet Utama Keluarga tidak ditemukan'; end if;

  perform 1 from public.wallets where id = v_main for update;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id and family_id = p_family_id and deleted_at is null
  for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_tx.wallet_id <> v_main then raise exception 'Transaksi bukan Dompet Utama Keluarga'; end if;
  if not (v_tx.created_by = v_uid or private.is_admin(p_family_id)) then
    raise exception 'Tidak memiliki akses hapus transaksi ini';
  end if;

  if v_tx.type = 'income' then
    v_balance := private.family_main_balance(v_main) - v_tx.amount;
    if v_balance < 0 then raise exception 'Saldo Dompet Utama tidak cukup untuk membatalkan pemasukan ini'; end if;
  end if;

  update public.transactions
  set deleted_at = now()
  where id = p_transaction_id;
end;
$$;

revoke all on function private.get_family_wallets(uuid) from public, anon;
revoke all on function private.family_main_balance(uuid) from public, anon;
revoke all on function private.family_savings_balance(uuid) from public, anon;
grant execute on function private.get_family_wallets(uuid) to authenticated;
grant execute on function private.family_main_balance(uuid) to authenticated;
grant execute on function private.family_savings_balance(uuid) to authenticated;

revoke all on function public.family_record_income(uuid,numeric,date,uuid,text,text,uuid) from public, anon;
revoke all on function public.family_record_expense(uuid,numeric,date,uuid,text,text,uuid) from public, anon;
revoke all on function public.family_deposit_internal(uuid,numeric,date,text,uuid) from public, anon;
revoke all on function public.family_deposit_external(uuid,numeric,date,uuid,text,uuid) from public, anon;
revoke all on function public.family_withdraw_internal(uuid,numeric,date,text,uuid) from public, anon;
revoke all on function public.family_update_transaction(uuid,uuid,text,numeric,date,uuid,text,text,uuid) from public, anon;
revoke all on function public.family_delete_transaction(uuid,uuid) from public, anon;

grant execute on function public.family_record_income(uuid,numeric,date,uuid,text,text,uuid) to authenticated;
grant execute on function public.family_record_expense(uuid,numeric,date,uuid,text,text,uuid) to authenticated;
grant execute on function public.family_deposit_internal(uuid,numeric,date,text,uuid) to authenticated;
grant execute on function public.family_deposit_external(uuid,numeric,date,uuid,text,uuid) to authenticated;
grant execute on function public.family_withdraw_internal(uuid,numeric,date,text,uuid) to authenticated;
grant execute on function public.family_update_transaction(uuid,uuid,text,numeric,date,uuid,text,text,uuid) to authenticated;
grant execute on function public.family_delete_transaction(uuid,uuid) to authenticated;

commit;
