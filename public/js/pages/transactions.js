import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import {
  guestAvailable,
  guestMember,
  listGuestCategories,
  listGuestTransactions,
  listGuestWallets,
  saveGuestTransaction,
  deleteGuestTransaction
} from '../lib/guest-store.js'

const ctx = await initPage('/transactions')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  const form = $('tx-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { user, familyId } = ctx
  let editingId = null
  let categories = []
  let wallets = []
  let members = []
  let myRole = 'member'

  const showError = (msg = '') => { $('error').textContent = msg }
  const showFormError = (msg = '') => { $('form-error').textContent = msg }

  function familyMainWallet() {
    return wallets.find((w) => w.scope === 'family_main' && !w.is_archived) || wallets.find((w) => !w.is_archived)
  }

  async function loadRefs() {
    if (guest) {
      const ok = await guestAvailable()
      if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
      categories = await listGuestCategories()
      wallets = (await listGuestWallets()).filter((w) => !w.is_archived)
      members = [guestMember()]
      myRole = 'owner'
    } else {
      const [c, w, m] = await Promise.all([
        sb.from('categories').select('id, name, type').eq('family_id', familyId).eq('is_archived', false).order('name'),
        sb.from('wallets').select('id, name, type, scope').eq('family_id', familyId).eq('is_archived', false).order('name'),
        sb.from('family_members')
          .select('user_id, role, profiles(full_name, email)')
          .eq('family_id', familyId).eq('status', 'active')
      ])
      const err = c.error || w.error || m.error
      if (err) throw err
      categories = c.data
      wallets = w.data
      members = m.data
      myRole = members.find((x) => x.user_id === user.id)?.role ?? 'member'
    }

    $('filter-category').replaceChildren(
      el('option', { value: '' }, 'Semua'),
      ...categories.map((c) => el('option', { value: c.id }, c.name)))
    $('filter-wallet').replaceChildren(
      el('option', { value: '' }, 'Semua'),
      ...wallets.map((w) => el('option', { value: w.id }, w.name)))
    $('filter-member').replaceChildren(
      el('option', { value: '' }, guest ? 'Tamu' : 'Semua'),
      ...members.map((m) => el('option', { value: m.user_id },
        m.profiles?.full_name || m.profiles?.email || 'Anggota')))
  }

  function fillCategoryOptions() {
    const items = categories.filter((c) => c.type === $('tx-type').value)
    $('tx-category').replaceChildren(
      el('option', { value: '' }, 'Tanpa kategori'),
      ...items.map((c) => el('option', { value: c.id }, c.name)))
  }

  function fillWalletOptions() {
    const main = familyMainWallet()
    const list = main ? [main, ...wallets.filter((w) => w.id !== main.id && w.scope !== 'family_savings')] : wallets.filter((w) => w.scope !== 'family_savings')
    $('tx-wallet').replaceChildren(...list.map((w) => {
      const label = w.scope === 'family_main' ? `${w.name}` : w.name
      return el('option', { value: w.id }, label)
    }))
  }

  async function load() {
    let data = []
    if (guest) {
      data = await listGuestTransactions({
        search: $('filter-search').value,
        type: $('filter-type').value,
        from: $('filter-from').value,
        to: $('filter-to').value,
        categoryId: $('filter-category').value,
        walletId: $('filter-wallet').value,
        memberId: $('filter-member').value
      })
    } else {
      let query = sb.from('transactions')
        .select('id, title, amount, type, transaction_date, note, visibility, created_by, category_id, wallet_id, profiles(full_name, email), categories(name), wallets(name, scope)')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)

      const search = $('filter-search').value.trim().replace(/[,%()]/g, ' ')
      if (search) query = query.or(`title.ilike.%${search}%,note.ilike.%${search}%`)
      if ($('filter-type').value) query = query.eq('type', $('filter-type').value)
      if ($('filter-from').value) query = query.gte('transaction_date', $('filter-from').value)
      if ($('filter-to').value) query = query.lte('transaction_date', $('filter-to').value)
      if ($('filter-category').value) query = query.eq('category_id', $('filter-category').value)
      if ($('filter-wallet').value) query = query.eq('wallet_id', $('filter-wallet').value)
      if ($('filter-member').value) query = query.eq('created_by', $('filter-member').value)

      const res = await query
      if (res.error) return showError(res.error.message)
      data = res.data
    }
    showError()
    $('tx-list').replaceChildren(...data.map(row))
    $('empty').hidden = data.length > 0
  }

  function row(t) {
    const name = t.profiles?.full_name || t.profiles?.email || 'Anggota'
    const category = t.categories?.name ?? '-'
    const wallet = t.wallets?.name ?? '-'
    const typeLabel = t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'
    const canEdit = guest || t.created_by === user.id || ['owner', 'admin'].includes(myRole)
    return el('div', { class: 'cat-row tx-row' },
      el('div', { class: 'tx-main' },
        el('div', { class: 'tx-title' }, t.title),
        el('div', { class: 'muted' },
          `${t.transaction_date} · ${typeLabel} · ${category} · ${wallet} · ${name}`),
        t.note ? el('div', { class: 'muted' }, t.note) : null),
      el('div', { class: `tx-amount ${t.type}` }, formatRupiah(t.amount)),
      canEdit ? el('div', { class: 'row-actions' },
        el('button', { class: 'btn-link', onclick: () => openForm(t) }, 'Edit'),
        el('button', { class: 'btn-link', onclick: () => remove(t) }, 'Hapus')) : null)
  }

  function openForm(t = null) {
    editingId = t?.id ?? null
    $('tx-type').value = t?.type ?? 'expense'
    fillCategoryOptions()
    fillWalletOptions()
    $('tx-title').value = t?.title ?? ''
    $('tx-amount').value = t?.amount ?? ''
    $('tx-category').value = t?.category_id ?? ''
    $('tx-wallet').value = t?.wallet_id ?? familyMainWallet()?.id ?? wallets[0]?.id ?? ''
    $('tx-wallet').disabled = !!editingId
    $('tx-date').value = t?.transaction_date ?? new Date().toISOString().slice(0, 10)
    $('tx-visibility').value = 'shared'
    $('tx-note').value = t?.note ?? ''
    showFormError()
    form.hidden = false
    $('tx-title').focus()
  }

  function closeForm() {
    editingId = null
    form.hidden = true
    form.reset()
    $('tx-wallet').disabled = false
    showFormError()
  }

  async function remove(t) {
    if (!confirm(`Hapus transaksi "${t.title}"?`)) return
    try {
      if (guest) await deleteGuestTransaction(t.id)
      else {
        const targetWallet = wallets.find((w) => w.id === t.wallet_id)
        if (targetWallet?.scope === 'family_main') {
          const { error } = await sb.rpc('family_delete_transaction', {
            p_transaction_id: t.id,
            p_family_id: familyId
          })
          if (error) throw error
        } else {
          const { error } = await sb.from('transactions')
            .update({ deleted_at: new Date().toISOString() }).eq('id', t.id)
          if (error) throw error
        }
      }
      await load()
    } catch (e) {
      showError(e.message)
    }
  }

  $('tx-type').addEventListener('change', fillCategoryOptions)
  $('btn-add').addEventListener('click', () => openForm())
  $('btn-cancel').addEventListener('click', closeForm)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showFormError()
    const payload = {
      wallet_id: $('tx-wallet').value,
      category_id: $('tx-category').value || null,
      type: $('tx-type').value,
      title: $('tx-title').value.trim(),
      amount: Number($('tx-amount').value),
      transaction_date: $('tx-date').value,
      note: $('tx-note').value.trim() || null,
      visibility: 'shared'
    }
    try {
      if (guest) await saveGuestTransaction(payload, editingId)
      else {
        const targetWallet = wallets.find((w) => w.id === payload.wallet_id)
        const isFamilyMain = targetWallet?.scope === 'family_main'
        if (isFamilyMain) {
          if (editingId) {
            const { error } = await sb.rpc('family_update_transaction', {
              p_transaction_id: editingId,
              p_family_id: familyId,
              p_type: payload.type,
              p_amount: payload.amount,
              p_transaction_date: payload.transaction_date,
              p_category_id: payload.category_id,
              p_title: payload.title,
              p_note: payload.note,
              p_client_op_id: crypto.randomUUID()
            })
            if (error) throw error
          } else {
            const rpc = payload.type === 'income' ? 'family_record_income' : 'family_record_expense'
            const { error } = await sb.rpc(rpc, {
              p_family_id: familyId,
              p_amount: payload.amount,
              p_transaction_date: payload.transaction_date,
              p_category_id: payload.category_id,
              p_title: payload.title,
              p_note: payload.note,
              p_client_op_id: crypto.randomUUID()
            })
            if (error) throw error
          }
        } else if (editingId) {
          const { error } = await sb.from('transactions').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await sb.from('transactions').insert({
            ...payload,
            family_id: familyId,
            created_by: user.id,
            client_op_id: crypto.randomUUID()
          })
          if (error) throw error
        }
      }
      closeForm()
      await load()
    } catch (err) {
      showFormError(err.message)
    }
  })

  $('filter-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    await load()
  })

  $('btn-reset-filter').addEventListener('click', async () => {
    $('filter-form').reset()
    await load()
  })

  try {
    await loadRefs()
    await load()
    if (new URLSearchParams(location.search).has('new')) openForm()
  } catch (e) {
    showError(e.message)
  }
}
