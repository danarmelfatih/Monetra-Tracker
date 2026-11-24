import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { splitWalletBalances } from '../lib/wallet-summary.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'
import { guestAvailable, listGuestWallets, saveGuestWallet, archiveGuestWallet, buildGuestReportData, guestWalletBalances } from '../lib/guest-store.js'

const ctx = await initPage('/savings')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()
  const form = $('savings-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { user, familyId } = ctx
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
    try {
      if (guest) await archiveGuestWallet(wallet.id)
      else {
        const { error } = await sb.from('wallets').update({ is_archived: true }).eq('id', wallet.id)
        if (error) throw error
      }
      await load()
    } catch (e) {
      showError(e.message)
    }
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

    try {
      let wallets = []
      let balances = []

      if (guest) {
        const ok = await guestAvailable()
        if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
        const data = await buildGuestReportData()
        wallets = data.wallets.filter((w) => w.type === 'savings' && !w.is_archived)
        balances = guestWalletBalances(data.wallets, data.transactions, data.transfers)
      } else {
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
        if (err) throw err
        wallets = walletRes.data ?? []
        balances = balanceRes.data ?? []
      }

      const summary = splitWalletBalances(wallets, balances)
      const balanceMap = new Map(summary.savingsBalances.map((row) => [row.wallet_id, Number(row.balance)]))

      $('savings-total').textContent = formatRupiah(summary.savingsTotal)
      $('savings-count').textContent = String(wallets.length)
      $('savings-list').replaceChildren(...wallets.map((wallet) => card(wallet, balanceMap)))
      $('savings-empty').hidden = wallets.length > 0
      $('savings-loading').hidden = true
    } catch (e) {
      $('savings-total').textContent = '-'
      $('savings-count').textContent = '-'
      $('savings-loading').hidden = true
      showError(e.message)
    }
  }

  $('btn-add').addEventListener('click', () => openForm())
  $('btn-cancel').addEventListener('click', closeForm)
  $('btn-retry').addEventListener('click', load)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showFormError()
    const payload = {
      name: $('savings-name').value.trim(),
      initial_balance: Number($('savings-balance').value),
      type: 'savings'
    }
    try {
      if (guest) await saveGuestWallet(payload, editingId)
      else if (editingId) {
        const { error } = await sb.from('wallets').update({ name: payload.name, initial_balance: payload.initial_balance }).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await sb.from('wallets').insert({
          family_id: familyId,
          owner_id: user.id,
          type: 'savings',
          name: payload.name,
          initial_balance: payload.initial_balance
        })
        if (error) throw error
      }
      closeForm()
      await load()
    } catch (err) {
      showFormError(err.message)
    }
  })

  await load()
}