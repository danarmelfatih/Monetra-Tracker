-- =====================================================================
-- FAMILY FINANCE - MIGRATION 5: SCOPE-AWARE RLS
-- Family main/savings are shared to active family members.
-- Legacy personal wallets remain owner-only and read-only in new family flow.
-- =====================================================================

begin;

create or replace function private.wallet_scope(p_wallet_id uuid)
returns public.wallet_scope
language sql stable security definer set search_path = '' as $$
  select w.scope from public.wallets w where w.id = p_wallet_id;
$$;

create or replace function private.can_view_wallet(p_wallet_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.wallets w
    where w.id = p_wallet_id
      and (
        (w.scope = 'legacy_personal' and w.owner_id = (select auth.uid()))
        or (w.scope in ('family_main', 'family_savings') and private.is_member(w.family_id))
      )
  );
$$;

create or replace function private.can_use_family_wallet(p_wallet_id uuid, p_family_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.wallets w
    where w.id = p_wallet_id
      and w.family_id = p_family_id
      and w.scope in ('family_main', 'family_savings')
      and w.is_archived = false
      and private.is_member(p_family_id)
  );
$$;

create or replace function private.can_manage_family_wallet(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_family_id);
$$;

revoke all on function private.wallet_scope(uuid) from public, anon;
revoke all on function private.can_view_wallet(uuid) from public, anon;
revoke all on function private.can_use_family_wallet(uuid,uuid) from public, anon;
revoke all on function private.can_manage_family_wallet(uuid) from public, anon;
grant execute on function private.wallet_scope(uuid) to authenticated;
grant execute on function private.can_view_wallet(uuid) to authenticated;
grant execute on function private.can_use_family_wallet(uuid,uuid) to authenticated;
grant execute on function private.can_manage_family_wallet(uuid) to authenticated;

-- WALLETS: legacy personal owner-only; family shared visible to active members.
drop policy if exists wallets_select on public.wallets;
drop policy if exists wallets_insert on public.wallets;
drop policy if exists wallets_update on public.wallets;

create policy wallets_select on public.wallets for select to authenticated
using (
  (
    scope = 'legacy_personal'
    and owner_id = (select auth.uid())
    and private.is_member(family_id)
  )
  or (
    scope in ('family_main', 'family_savings')
    and private.is_member(family_id)
  )
);

-- Legacy personal wallets remain creatable by owner for compatibility; new family flow uses provisioned wallets.
create policy wallets_insert on public.wallets for insert to authenticated
with check (
  (
    scope = 'legacy_personal'
    and owner_id = (select auth.uid())
    and private.is_member(family_id)
  )
  or (
    scope in ('family_main', 'family_savings')
    and owner_id is null
    and private.is_admin(family_id)
  )
);

create policy wallets_update on public.wallets for update to authenticated
using (
  (
    scope = 'legacy_personal'
    and owner_id = (select auth.uid())
    and private.is_member(family_id)
  )
  or (
    scope in ('family_main', 'family_savings')
    and private.is_admin(family_id)
  )
)
with check (
  (
    scope = 'legacy_personal'
    and owner_id = (select auth.uid())
    and private.is_member(family_id)
  )
  or (
    scope in ('family_main', 'family_savings')
    and owner_id is null
    and private.is_admin(family_id)
  )
);

-- TRANSACTIONS: family wallet transactions visible to active family members.
drop policy if exists tx_select on public.transactions;
drop policy if exists tx_insert on public.transactions;
drop policy if exists tx_update on public.transactions;

create policy tx_select on public.transactions for select to authenticated
using (
  private.is_member(family_id)
  and (
    visibility = 'shared'
    or created_by = (select auth.uid())
    or private.is_admin(family_id)
    or exists (
      select 1 from public.wallets w
      where w.id = transactions.wallet_id
        and w.scope in ('family_main', 'family_savings')
    )
  )
);

create policy tx_insert on public.transactions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_member(family_id)
  and private.category_ok(category_id, family_id)
  and exists (
    select 1 from public.wallets w
    where w.id = wallet_id
      and w.family_id = family_id
      and w.is_archived = false
      and (
        (w.scope = 'legacy_personal' and w.owner_id = (select auth.uid()))
        or (w.scope in ('family_main', 'family_savings') and private.is_member(family_id))
      )
  )
);

create policy tx_update on public.transactions for update to authenticated
using (
  private.is_member(family_id)
  and (
    created_by = (select auth.uid())
    or private.is_admin(family_id)
  )
)
with check (
  private.is_member(family_id)
  and (
    created_by = (select auth.uid())
    or private.is_admin(family_id)
  )
  and private.category_ok(category_id, family_id)
  and exists (
    select 1 from public.wallets w
    where w.id = wallet_id
      and w.family_id = family_id
      and w.is_archived = false
      and (
        (w.scope = 'legacy_personal' and w.owner_id = created_by)
        or (w.scope in ('family_main', 'family_savings') and private.is_member(family_id))
      )
  )
);

-- SAVINGS LEDGER: readable by active members; writes only through RPC (no direct client write policy).
drop policy if exists savings_ledger_select on public.savings_ledger;
create policy savings_ledger_select on public.savings_ledger for select to authenticated
using (private.is_member(family_id));

revoke all on public.savings_ledger from anon;
grant select on public.savings_ledger to authenticated;
revoke insert, update, delete on public.savings_ledger from anon, authenticated;

commit;
