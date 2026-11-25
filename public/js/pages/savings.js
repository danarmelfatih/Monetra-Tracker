import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { splitWalletBalances } from '../lib/wallet-summary.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'
import { isMissingFamilyFinanceSchema } from '../lib/schema-compat.js'
import {
  guestAvailable,
  buildGuestReportData,
  listGuestCategories,
  listGuestSavingsLedger,
  guestDepositInternal,
  guestDepositExternal,
  guestWithdrawInternal,
  listGuestWallets,
  saveGuestWallet,
  archiveGuestWallet,
  guestWalletBalances
} from '../lib/guest-store.js'

const ctx = await initPage('/savings')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()
  const form = $('savings-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { familyId, user } = ctx
  let categories = []
  let mainBalance = 0
  let savingsBalance = 0
  let legacyMode = false
  let legacyEditingId = null

  const showError = (message = '') => {
    $('error').textContent = message ? `Gagal memuat tabungan: ${message}. Coba muat ulang halaman.` : ''
    $('btn-retry').hidden = !message
  }
  const showFormError = (message = '') => { $('form-error').textContent = message }

  function kindLabel(kind) {
    if (kind === 'deposit_internal') return 'Setor dari Dompet Utama'
    if (kind === 'deposit_external') return 'Setor dari Luar Dompet'
    return 'Tarik ke Dompet Utama'
  }

  function fillCategories() {
    const sourceEl = $('savings-source')
    const isExternal = sourceEl && sourceEl.value === 'deposit_external'
    const wrap = $('category-wrap')
    const cat = $('savings-category')
    if (wrap) wrap.hidden = !isExternal
    if (cat) {
      cat.required = isExternal
      if (!isExternal) cat.replaceChildren(el('option', { value: '' }, 'Pilih kategori'))
      else cat.replaceChildren(
        el('option', { value: '' }, 'Pilih kategori'),
        ...categories.filter((c) => c.type === 'income').map((c) => el('option', { value: c.id }, c.name))
      )
    }
  }

  async function loadRefs() {
    if (guest) {
      categories = await listGuestCategories()
    } else {
      const { data, error } = await sb.from('categories')
        .select('id, name, type')
        .eq('family_id', familyId)
        .eq('is_archived', false)
        .order('name')
      if (error) throw error
      categories = data ?? []
    }
    fillCategories()
  }

  async function loadBalances() {
    if (guest) {
      const data = await buildGuestReportData()
      const main = data.balances.find((b) => data.wallets.find((w) => w.id === b.wallet_id)?.scope === 'family_main')
      const savings = data.balances.find((b) => data.wallets.find((w) => w.id === b.wallet_id)?.scope === 'family_savings')
      mainBalance = Number(main?.balance ?? 0)
      savingsBalance = Number(savings?.balance ?? 0)
      $('savings-total').textContent = formatRupiah(savingsBalance)
      const hint = $('main-balance-hint')
      if (hint) hint.textContent = `Saldo Dompet Utama: ${formatRupiah(mainBalance)}`
      $('savings-count').textContent = '1'
      return
    }

    const mainW = await sb.from('wallets').select('id').eq('family_id', familyId).eq('scope', 'family_main').eq('is_archived', false).maybeSingle()
    if (mainW.error && isMissingFamilyFinanceSchema(mainW.error)) {
      legacyMode = true
      return loadLegacy()
    }
    if (mainW.error) throw mainW.error
    const savingsW = await sb.from('wallets').select('id').eq('family_id', familyId).eq('scope', 'family_savings').eq('is_archived', false).maybeSingle()
    if (savingsW.error) throw savingsW.error
    const [mainB, savingsB] = await Promise.all([
      mainW.data ? sb.from('family_main_balances').select('balance').eq('wallet_id', mainW.data.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      savingsW.data ? sb.from('family_savings_balances').select('balance').eq('wallet_id', savingsW.data.id).maybeSingle() : Promise.resolve({ data: null, error: null })
    ])
    const err = mainB.error || savingsB.error
    if (err) {
      if (isMissingFamilyFinanceSchema(err)) { legacyMode = true; return loadLegacy() }
      throw err
    }
    mainBalance = Number(mainB.data?.balance ?? 0)
    savingsBalance = Number(savingsB.data?.balance ?? 0)
    $('savings-total').textContent = formatRupiah(savingsBalance)
    const hint = $('main-balance-hint')
    if (hint) hint.textContent = `Saldo Dompet Utama: ${formatRupiah(mainBalance)}`
    $('savings-count').textContent = '1'
  }

  function ledgerRow(entry) {
    const amountClass = entry.kind === 'withdraw_internal' ? 'expense' : 'income'
    const sign = entry.kind === 'withdraw_internal' ? '-' : '+'
    const detail = entry.kind === 'deposit_external'
      ? `Sumber: ${entry.categories?.name || 'Eksternal'}`
      : (entry.kind === 'deposit_internal' ? 'Sumber: Dompet Utama Keluarga' : 'Tujuan: Dompet Utama Keluarga')
    return el('div', { class: 'cat-row tx-row' },
      el('div', { class: 'tx-main' },
        el('div', { class: 'tx-title' }, kindLabel(entry.kind)),
        el('div', { class: 'muted' }, `${entry.entry_date} · ${detail} · ${entry.profiles?.full_name || 'Anggota'}`),
        entry.note ? el('div', { class: 'muted' }, entry.note) : null),
      el('div', { class: `tx-amount ${amountClass}` }, `${sign}${formatRupiah(entry.amount)}`))
  }

  function legacyCard(wallet, balanceMap) {
    return el('article', { class: 'panel wallet-card' },
      el('div', { class: 'w-name' }, wallet.name),
      el('div', { class: 'w-type' }, 'Tabungan'),
      el('div', { class: 'w-balance', 'data-amount': true }, formatRupiah(balanceMap.get(wallet.id) ?? wallet.initial_balance)),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn-link', type: 'button', onclick: () => openLegacyForm(wallet) }, 'Edit'),
        el('button', { class: 'btn-link', type: 'button', onclick: () => archiveLegacy(wallet) }, 'Arsipkan')))
  }

  function setFormMode() {
    const ledger = $('ledger-fields')
    const legacy = $('legacy-fields')
    if (ledger) ledger.hidden = legacyMode
    if (legacy) legacy.hidden = !legacyMode
    const amount = $('savings-amount')
    const date = $('savings-date')
    const name = $('savings-name')
    const bal = $('savings-balance')
    if (amount) amount.required = !legacyMode
    if (date) date.required = !legacyMode
    if (name) name.required = legacyMode
    if (bal) bal.required = legacyMode
  }

  async function loadLegacy() {
    legacyMode = true
    setFormMode()
    let wallets = []
    let balances = []
    if (guest) {
      const data = await buildGuestReportData()
      wallets = data.wallets.filter((w) => w.type === 'savings' && !w.is_archived)
      balances = guestWalletBalances(data.wallets, data.transactions, data.transfers)
    } else {
      const [walletRes, balanceRes] = await Promise.all([
        sb.from('wallets').select('id, name, type, initial_balance').eq('family_id', familyId).eq('type', 'savings').eq('is_archived', false).order('created_at'),
        sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
      ])
      if (walletRes.error) throw walletRes.error
      if (balanceRes.error) throw balanceRes.error
      wallets = walletRes.data ?? []
      balances = balanceRes.data ?? []
    }
    const summary = splitWalletBalances(wallets, balances)
    const balanceMap = new Map(summary.savingsBalances.map((row) => [row.wallet_id, Number(row.balance)]))
    $('savings-total').textContent = formatRupiah(summary.savingsTotal)
    $('savings-count').textContent = String(wallets.length)
    const hint = $('main-balance-hint')
    if (hint) hint.textContent = 'Mode kompatibilitas: skema family finance belum aktif di database.'
    $('savings-list').replaceChildren(...wallets.map((wallet) => legacyCard(wallet, balanceMap)))
    $('savings-empty').hidden = wallets.length > 0
    $('savings-empty').textContent = 'Belum ada tabungan.'
  }

  async function loadLedger() {
    if (legacyMode) return
    let rows = []
    if (guest) {
      rows = await listGuestSavingsLedger(30)
    } else {
      const { data, error } = await sb.from('savings_ledger')
        .select('id, kind, amount, entry_date, note, created_by, category_id, categories(name), profiles(full_name, email)')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) {
        if (isMissingFamilyFinanceSchema(error)) { await loadLegacy(); return }
        throw error
      }
      rows = data ?? []
    }
    $('savings-list').replaceChildren(...rows.map(ledgerRow))
    $('savings-empty').hidden = rows.length > 0
    $('savings-empty').textContent = 'Belum ada mutasi tabungan.'
  }

  async function load() {
    showError()
    $('savings-loading').hidden = false
    $('savings-list').replaceChildren()
    $('savings-empty').hidden = true
    try {
      await loadRefs()
      await loadBalances()
      await loadLedger()
      $('savings-loading').hidden = true
    } catch (e) {
      $('savings-total').textContent = '-'
      $('savings-count').textContent = '-'
      $('savings-loading').hidden = true
      showError(e.message)
    }
  }

  function openForm() {
    setFormMode()
    if (legacyMode) return openLegacyForm()
    form.hidden = false
    showFormError()
    if ($('savings-date') && !$('savings-date').value) $('savings-date').value = new Date().toISOString().slice(0, 10)
    fillCategories()
    const amount = $('savings-amount')
    if (amount) amount.focus()
  }

  function closeForm() {
    form.hidden = true
    form.reset()
    legacyEditingId = null
    const wrap = $('category-wrap')
    if (wrap) wrap.hidden = true
    showFormError()
  }

  function openLegacyForm(wallet = null) {
    legacyEditingId = wallet?.id ?? null
    setFormMode()
    if ($('savings-name')) $('savings-name').value = wallet?.name ?? ''
    if ($('savings-balance')) $('savings-balance').value = wallet?.initial_balance ?? 0
    form.hidden = false
    showFormError()
    const name = $('savings-name')
    if (name) name.focus()
  }

  async function archiveLegacy(wallet) {
    if (!confirm(`Arsipkan tabungan "${wallet.name}"?`)) return
    try {
      if (guest) await archiveGuestWallet(wallet.id)
      else {
        const { error } = await sb.from('wallets').update({ is_archived: true }).eq('id', wallet.id)
        if (error) throw error
      }
      await load()
    } catch (e) { showError(e.message) }
  }

  $('btn-add').addEventListener('click', openForm)
  $('btn-cancel').addEventListener('click', closeForm)
  $('btn-retry').addEventListener('click', load)
  const source = $('savings-source')
  if (source) source.addEventListener('change', fillCategories)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showFormError()
    try {
      if (legacyMode) {
        const payload = {
          name: $('savings-name').value.trim(),
          initial_balance: Number($('savings-balance').value),
          type: 'savings'
        }
        if (guest) await saveGuestWallet(payload, legacyEditingId)
        else if (legacyEditingId) {
          const { error } = await sb.from('wallets').update({ name: payload.name, initial_balance: payload.initial_balance }).eq('id', legacyEditingId)
          if (error) throw error
        } else {
          const { error } = await sb.from('wallets').insert({ family_id: familyId, owner_id: user.id, type: 'savings', name: payload.name, initial_balance: payload.initial_balance })
          if (error) throw error
        }
        closeForm()
        await load()
        return
      }

      const kind = $('savings-source').value
      const payload = {
        amount: Number($('savings-amount').value),
        entry_date: $('savings-date').value,
        note: $('savings-note').value.trim() || null,
        category_id: $('savings-category').value || null
      }
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) return showFormError('Nominal harus lebih dari 0.')
      if (kind === 'deposit_external' && !payload.category_id) return showFormError('Kategori sumber dana wajib dipilih.')
      if (guest) {
        if (kind === 'deposit_internal') await guestDepositInternal(payload)
        else if (kind === 'deposit_external') await guestDepositExternal(payload)
        else await guestWithdrawInternal(payload)
      } else {
        const rpc = kind === 'deposit_internal' ? 'family_deposit_internal'
          : kind === 'deposit_external' ? 'family_deposit_external'
            : 'family_withdraw_internal'
        const rpcPayload = kind === 'deposit_external'
          ? { p_family_id: familyId, p_amount: payload.amount, p_entry_date: payload.entry_date, p_category_id: payload.category_id, p_note: payload.note, p_client_op_id: crypto.randomUUID() }
          : { p_family_id: familyId, p_amount: payload.amount, p_entry_date: payload.entry_date, p_note: payload.note, p_client_op_id: crypto.randomUUID() }
        const { error } = await sb.rpc(rpc, rpcPayload)
        if (error) {
          if (isMissingFamilyFinanceSchema(error)) { legacyMode = true; showFormError('Skema family finance belum aktif di database.'); return }
          throw error
        }
      }
      closeForm()
      await load()
    } catch (err) {
      showFormError(err.message)
    }
  })

  await load()
}
