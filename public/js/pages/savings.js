import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'
import {
  guestAvailable,
  buildGuestReportData,
  listGuestCategories,
  listGuestSavingsLedger,
  guestDepositInternal,
  guestDepositExternal,
  guestWithdrawInternal
} from '../lib/guest-store.js'

const ctx = await initPage('/savings')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()
  const form = $('savings-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { familyId } = ctx
  let categories = []
  let mainBalance = 0
  let savingsBalance = 0

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
    const source = $('savings-source').value
    const isExternal = source === 'deposit_external'
    $('category-wrap').hidden = !isExternal
    $('savings-category').required = isExternal
    if (!isExternal) {
      $('savings-category').replaceChildren(el('option', { value: '' }, 'Pilih kategori'))
      return
    }
    $('savings-category').replaceChildren(
      el('option', { value: '' }, 'Pilih kategori'),
      ...categories.filter((c) => c.type === 'income').map((c) => el('option', { value: c.id }, c.name))
    )
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
    } else {
      const [mainW, savingsW] = await Promise.all([
        sb.from('wallets').select('id').eq('family_id', familyId).eq('scope', 'family_main').eq('is_archived', false).maybeSingle(),
        sb.from('wallets').select('id').eq('family_id', familyId).eq('scope', 'family_savings').eq('is_archived', false).maybeSingle()
      ])
      if (mainW.error || savingsW.error) throw mainW.error || savingsW.error
      const [mainB, savingsB] = await Promise.all([
        mainW.data ? sb.from('family_main_balances').select('balance').eq('wallet_id', mainW.data.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        savingsW.data ? sb.from('family_savings_balances').select('balance').eq('wallet_id', savingsW.data.id).maybeSingle() : Promise.resolve({ data: null, error: null })
      ])
      if (mainB.error || savingsB.error) throw mainB.error || savingsB.error
      mainBalance = Number(mainB.data?.balance ?? 0)
      savingsBalance = Number(savingsB.data?.balance ?? 0)
    }
    $('savings-total').textContent = formatRupiah(savingsBalance)
    $('main-balance-hint').textContent = `Saldo Dompet Utama: ${formatRupiah(mainBalance)}`
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

  async function loadLedger() {
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
      if (error) throw error
      rows = data ?? []
    }
    $('savings-list').replaceChildren(...rows.map(ledgerRow))
    $('savings-empty').hidden = rows.length > 0
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
    form.hidden = false
    showFormError()
    if (!$('savings-date').value) $('savings-date').value = new Date().toISOString().slice(0, 10)
    fillCategories()
    $('savings-amount').focus()
  }

  function closeForm() {
    form.hidden = true
    form.reset()
    $('category-wrap').hidden = true
    showFormError()
  }

  $('btn-add').addEventListener('click', openForm)
  $('btn-cancel').addEventListener('click', closeForm)
  $('btn-retry').addEventListener('click', load)
  $('savings-source').addEventListener('change', fillCategories)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    showFormError()
    const kind = $('savings-source').value
    const payload = {
      amount: Number($('savings-amount').value),
      entry_date: $('savings-date').value,
      note: $('savings-note').value.trim() || null,
      category_id: $('savings-category').value || null
    }
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) return showFormError('Nominal harus lebih dari 0.')
    if (kind === 'deposit_external' && !payload.category_id) return showFormError('Kategori sumber dana wajib dipilih.')
    try {
      if (guest) {
        if (kind === 'deposit_internal') await guestDepositInternal(payload)
        else if (kind === 'deposit_external') await guestDepositExternal(payload)
        else await guestWithdrawInternal(payload)
      } else {
        const rpc = kind === 'deposit_internal' ? 'family_deposit_internal'
          : kind === 'deposit_external' ? 'family_deposit_external'
            : 'family_withdraw_internal'
        const rpcPayload = kind === 'deposit_external'
          ? {
            p_family_id: familyId,
            p_amount: payload.amount,
            p_entry_date: payload.entry_date,
            p_category_id: payload.category_id,
            p_note: payload.note,
            p_client_op_id: crypto.randomUUID()
          }
          : {
            p_family_id: familyId,
            p_amount: payload.amount,
            p_entry_date: payload.entry_date,
            p_note: payload.note,
            p_client_op_id: crypto.randomUUID()
          }
        const { error } = await sb.rpc(rpc, rpcPayload)
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
