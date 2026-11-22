import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { splitWalletBalances } from '../lib/wallet-summary.js'
import { privacyToggleButton } from '../components/privacy-toggle.js'

const ctx = await initPage('/savings')

if (ctx) {
  const sb = await getSb()
  const { user, familyId } = ctx
  const $ = (id) => document.getElementById(id)
  document.querySelector('.page-head .head-actions')?.prepend(privacyToggleButton())
  const form = $('savings-form')
  let editingId = null

  const showError = (message = '') => {
    $('error').textContent = message ? `Gagal memuat tabungan: ${message}. Coba muat ulang halaman.` : ''
    $('btn-retry').hidden = !message
  }
  const showFormError = (message = '') => { $('form-error').textContent = message }

  function openForm(wallet = null) {
    editingId = wallet?.id ?? null
    $('savings-name').value = wallet?.name ?? ''
    $('savings-balance').value = wallet?.initial_balance ?? 0
    showFormError()
    form.hidden = false
    $('savings-name').focus()
  }

  function closeForm() {
    editingId = null
    form.hidden = true
    form.reset()
    showFormError()
  }

  async function archive(wallet) {
    if (!confirm(`Arsipkan tabungan "${wallet.name}"?`)) return
    const { error } = await sb.from('wallets').update({ is_archived: true }).eq('id', wallet.id)
    if (error) return showError(error.message)
    await load()
  }

  function card(wallet, balances) {
    return el('article', { class: 'panel wallet-card' },
      el('div', { class: 'w-name' }, wallet.name),
      el('div', { class: 'w-type' }, 'Tabungan'),
      el('div', { class: 'w-balance', 'data-amount': true }, formatRupiah(balances.get(wallet.id) ?? wallet.initial_balance)),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-link', type: 'button', onclick: () => openForm(wallet) }, 'Edit'),
        el('button', { class: 'btn-link', type: 'button', onclick: () => archive(wallet) }, 'Arsipkan')))
  }

  async function load() {
    showError()
    $('savings-loading').hidden = false
    $('savings-list').replaceChildren()
    $('savings-empty').hidden = true
    $('savings-total').textContent = 'Memuat...'
    $('savings-count').textContent = 'Memuat...'

    const [walletRes, balanceRes] = await Promise.all([
      sb.from('wallets')
        .select('id, name, type, initial_balance')
        .eq('family_id', familyId)
        .eq('type', 'savings')
        .eq('is_archived', false)
        .order('created_at'),
      sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
    ])
    const err = walletRes.error || balanceRes.error
    if (err) {
      $('savings-total').textContent = '-'
      $('savings-count').textContent = '-'
      $('savings-loading').hidden = true
      showError(err.message)
      return
    }

    const wallets = walletRes.data ?? []
    const summary = splitWalletBalances(wallets, balanceRes.data ?? [])
    const balances = new Map(summary.savingsBalances.map((row) => [row.wallet_id, Number(row.balance)]))

    $('savings-total').textContent = formatRupiah(summary.savingsTotal)
    $('savings-count').textContent = String(wallets.length)
    $('savings-list').replaceChildren(...wallets.map((wallet) => card(wallet, balances)))
    $('savings-empty').hidden = wallets.length > 0
    $('savings-loading').hidden = true
  }

  $('btn-add').addEventListener('click', () => openForm())
  $('btn-cancel').addEventListener('click', closeForm)
  $('btn-retry').addEventListener('click', load)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showFormError()
    const payload = {
      name: $('savings-name').value.trim(),
      initial_balance: Number($('savings-balance').value)
    }
    let error
    if (editingId) {
      ({ error } = await sb.from('wallets').update(payload).eq('id', editingId))
    } else {
      ({ error } = await sb.from('wallets').insert({
        family_id: familyId,
        owner_id: user.id,
        type: 'savings',
        ...payload
      }))
    }
    if (error) return showFormError(error.message)
    closeForm()
    await load()
  })

  await load()
}
