import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'
import { summarizeFamilyBalances, splitWalletBalances } from '../lib/wallet-summary.js'
import { guestAvailable, buildGuestReportData } from '../lib/guest-store.js'
import { isMissingFamilyFinanceSchema } from '../lib/schema-compat.js'

const ctx = await initPage('/wallets')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { familyId } = ctx
  const TYPE_LABEL = { cash: 'Tunai', bank: 'Bank', ewallet: 'E-wallet', savings: 'Tabungan', other: 'Lainnya' }
  let wallets = []
  let balances = new Map()

  const showError = (msg = '') => { $('error').textContent = msg }


  async function loadLegacy() {
    const [w, b] = await Promise.all([
      sb.from('wallets')
        .select('id, name, type, initial_balance, is_archived')
        .eq('family_id', familyId).eq('is_archived', false).order('created_at'),
      sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
    ])
    const err = w.error || b.error
    if (err) return showError(err.message)
    wallets = w.data ?? []
    balances = new Map((b.data ?? []).map((row) => [row.wallet_id, Number(row.balance)]))
    showError()
    renderLegacyWallets()
  }

  function renderLegacyWallets() {
    const summary = splitWalletBalances(wallets, [...balances.entries()].map(([wallet_id, balance]) => ({ wallet_id, balance })))
    const ready = wallets.filter((w) => w.type !== 'savings')
    const savings = wallets.filter((w) => w.type === 'savings')
    $('family-main').replaceChildren(el('p', { class: 'muted' }, 'Mode kompatibilitas: skema Dompet Keluarga belum aktif di database. Menampilkan dompet legacy.'))
    $('family-savings').replaceChildren(el('p', { class: 'muted' }, `Total tabungan legacy: ${formatRupiah(summary.savingsTotal)}`))
    const cards = [...ready, ...savings].map((w) => walletCard(w, { badge: w.type === 'savings' ? 'Tabungan Lama' : 'Dompet', note: 'Read-only selama transisi. Data legacy tidak digabung otomatis.' }))
    $('legacy-list').replaceChildren(...cards)
    $('legacy-empty').hidden = cards.length > 0
    $('empty').hidden = cards.length > 0
  }
  async function load() {
    if (guest) {
      const ok = await guestAvailable()
      if (!ok) return showError('IndexedDB tidak tersedia di perangkat ini.')
      const data = await buildGuestReportData()
      wallets = data.wallets.filter((w) => !w.is_archived)
      balances = new Map(data.balances.map((r) => [r.wallet_id, Number(r.balance)]))
    } else {
      const w = await sb.from('wallets')
        .select('id, name, type, scope, initial_balance, is_archived, owner_id')
        .eq('family_id', familyId).eq('is_archived', false).order('created_at')
      if (w.error) {
        if (isMissingFamilyFinanceSchema(w.error)) return loadLegacy()
        return showError(w.error.message)
      }
      const [mainB, savingsB, legacyB] = await Promise.all([
        sb.from('family_main_balances').select('wallet_id, balance').eq('family_id', familyId),
        sb.from('family_savings_balances').select('wallet_id, balance').eq('family_id', familyId),
        sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
      ])
      const err = mainB.error || savingsB.error || legacyB.error
      if (err) {
        if (isMissingFamilyFinanceSchema(err)) return loadLegacy()
        return showError(err.message)
      }
      wallets = w.data ?? []
      const b = [...(mainB.data ?? []), ...(savingsB.data ?? []), ...(legacyB.data ?? [])]
      balances = new Map()
      for (const row of b) balances.set(row.wallet_id, Number(row.balance))
    }

    showError()
    renderWallets()
  }

  function walletCard(w, { badge = '', note = '' } = {}) {
    const balance = balances.get(w.id) ?? w.initial_balance
    return el('article', { class: 'panel wallet-card' },
      badge ? el('div', { class: 'muted' }, badge) : null,
      el('div', { class: 'w-name' }, w.name),
      el('div', { class: 'w-type' }, TYPE_LABEL[w.type] ?? 'Dompet'),
      el('div', { class: 'w-balance', 'data-amount': true }, formatRupiah(balance)),
      note ? el('div', { class: 'muted' }, note) : null)
  }

  function renderWallets() {
    const summary = summarizeFamilyBalances(wallets, [...balances.entries()].map(([wallet_id, balance]) => ({ wallet_id, balance })))
    const main = summary.main
    const savings = summary.savings
    const legacy = summary.legacy

    $('family-main').replaceChildren(main
      ? walletCard(main, { badge: 'Dompet Utama Keluarga', note: 'Dipakai bersama untuk pemasukan dan pengeluaran keluarga.' })
      : el('p', { class: 'muted' }, 'Dompet Utama Keluarga belum tersedia.'))

    $('family-savings').replaceChildren(savings
      ? walletCard(savings, { badge: 'Tabungan Keluarga', note: 'Kelola setor/tarik dari halaman Tabungan.' })
      : el('p', { class: 'muted' }, 'Tabungan Keluarga belum tersedia.'))

    $('legacy-list').replaceChildren(...legacy.map((w) => walletCard(w, { badge: 'Dompet Lama', note: 'Read-only selama transisi. Data lama tidak digabung otomatis.' })))
    $('legacy-empty').hidden = legacy.length > 0
    $('empty').hidden = wallets.length > 0
  }


  const transferBtn = $('btn-transfer')
  if (transferBtn) {
    transferBtn.addEventListener('click', () => {
      location.assign('/savings')
    })
  }

  await load()
}
