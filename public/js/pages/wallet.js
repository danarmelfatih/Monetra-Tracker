import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { privacyToggleButton } from '../components/privacy-toggle.js'

const ctx = await initPage('/wallets')

if (ctx) {
  const sb = await getSb()
  const { user, familyId } = ctx
  const TYPE_LABEL = {
    cash: 'Tunai', bank: 'Bank', ewallet: 'E-wallet', savings: 'Tabungan', other: 'Lainnya'
  }

  const $ = (id) => document.getElementById(id)
  document.querySelector('.page-head .head-actions')?.prepend(privacyToggleButton())
  const form = $('wallet-form')
  const transferForm = $('transfer-form')
  let editingId = null
  let wallets = []

  const showError = (msg = '') => { $('error').textContent = msg }
  const showTransferError = (msg = '') => { $('transfer-error').textContent = msg }

  async function load() {
    const [w, b, t, names] = await Promise.all([
      sb.from('wallets')
        .select('id, name, type, initial_balance')
        .eq('family_id', familyId).eq('is_archived', false).order('created_at'),
      sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId),
      sb.from('transfers')
        .select('id, amount, transfer_date, note, from_wallet_id, to_wallet_id')
        .eq('family_id', familyId).is('deleted_at', null)
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false }).limit(10),
      sb.from('wallets').select('id, name').eq('family_id', familyId)
    ])
    const err = w.error || b.error || t.error || names.error
    if (err) return showError(err.message)
    showError()

    wallets = w.data
    const balances = new Map(b.data.map((r) => [r.wallet_id, Number(r.balance)]))
    const nameById = new Map(names.data.map((r) => [r.id, r.name]))

    $('wallet-list').replaceChildren(...wallets.map((wal) => card(wal, balances)))
    $('empty').hidden = wallets.length > 0
    renderTransfers(t.data, nameById)
    fillTransferOptions()
  }

  function card(w, balances) {
    return el('article', { class: 'panel wallet-card' },
      el('div', { class: 'w-name' }, w.name),
      el('div', { class: 'w-type' }, TYPE_LABEL[w.type]),
      el('div', { class: 'w-balance', 'data-amount': true }, formatRupiah(balances.get(w.id) ?? w.initial_balance)),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-link', onclick: () => openForm(w) }, 'Edit'),
        el('button', { class: 'btn-link', onclick: () => archive(w) }, 'Arsipkan')))
  }

  function openForm(w = null) {
    editingId = w?.id ?? null
    $('w-name').value = w?.name ?? ''
    $('w-type').value = w?.type ?? 'cash'
    $('w-balance').value = w?.initial_balance ?? 0
    form.hidden = false
    $('w-name').focus()
  }

  function closeForm() {
    editingId = null
    form.hidden = true
    form.reset()
  }

  function fillTransferOptions() {
    const options = () => wallets.map((w) => el('option', { value: w.id }, w.name))
    $('t-from').replaceChildren(...options())
    $('t-to').replaceChildren(...options())
  }

  function renderTransfers(items, nameById) {
    if (!items.length) {
      $('transfer-list').replaceChildren(el('p', { class: 'muted' }, 'Belum ada transfer.'))
      return
    }
    $('transfer-list').replaceChildren(...items.map((t) => {
      const route = `${nameById.get(t.from_wallet_id) ?? 'Dompet'} → ${nameById.get(t.to_wallet_id) ?? 'Dompet'}`
      const note = t.note ? ` · ${t.note}` : ''
      return el('div', { class: 'cat-row' },
        el('span', {}, `${t.transfer_date} · ${route}${note}`),
        el('span', { 'data-amount': true }, formatRupiah(t.amount)))
    }))
  }

  async function archive(w) {
    if (!confirm(`Arsipkan dompet "${w.name}"?`)) return
    const { error } = await sb.from('wallets').update({ is_archived: true }).eq('id', w.id)
    if (error) return showError(error.message)
    await load()
  }

  $('btn-add').addEventListener('click', () => openForm())
  $('btn-cancel').addEventListener('click', closeForm)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showError()
    const payload = {
      name: $('w-name').value.trim(),
      type: $('w-type').value,
      initial_balance: Number($('w-balance').value)
    }
    let error
    if (editingId) {
      ({ error } = await sb.from('wallets').update(payload).eq('id', editingId))
    } else {
      ({ error } = await sb.from('wallets').insert({
        family_id: familyId,
        owner_id: user.id,
        ...payload
      }))
    }
    if (error) return showError(error.message)
    closeForm()
    await load()
  })

  $('btn-transfer').addEventListener('click', () => {
    showTransferError()
    transferForm.hidden = !transferForm.hidden
    if (!transferForm.hidden) {
      if (!$('t-date').value) $('t-date').value = new Date().toISOString().slice(0, 10)
      $('t-from').focus()
    }
  })

  $('btn-transfer-cancel').addEventListener('click', () => {
    transferForm.hidden = true
    transferForm.reset()
    showTransferError()
  })

  transferForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    showTransferError()
    const from = $('t-from').value
    const to = $('t-to').value
    const amount = Number($('t-amount').value)
    if (!from || !to) return showTransferError('Pilih dompet asal dan tujuan.')
    if (from === to) return showTransferError('Dompet asal dan tujuan harus berbeda.')
    if (!Number.isFinite(amount) || amount <= 0) return showTransferError('Nominal harus lebih dari 0.')

    const { data: bal, error: balError } = await sb
      .from('wallet_balances').select('balance').eq('wallet_id', from).maybeSingle()
    if (balError) return showTransferError(balError.message)
    if (Number(bal?.balance ?? 0) < amount) return showTransferError('Saldo dompet asal tidak cukup.')

    const { error } = await sb.from('transfers').insert({
      family_id: familyId,
      from_wallet_id: from,
      to_wallet_id: to,
      amount,
      transfer_date: $('t-date').value,
      note: $('t-note').value.trim() || null,
      created_by: user.id,
      client_op_id: crypto.randomUUID()
    })
    if (error) return showTransferError(error.message)
    transferForm.hidden = true
    transferForm.reset()
    await load()
  })

  await load()
}
