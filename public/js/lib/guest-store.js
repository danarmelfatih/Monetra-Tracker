import { GUEST_FAMILY_ID, GUEST_USER, GUEST_USER_ID } from './guest.js'
import { getAllGuest, hasIndexedDb, makeGuestId, nowIso, putGuest, putManyGuest } from './guest-db.js'
import { defaultGuestCategories, defaultGuestSavingsWallet, defaultGuestWallet } from './guest-seed.js'

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function dateString(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sortByDateDesc(rows, dateKey = 'transaction_date') {
  return [...rows].sort((a, b) => {
    const date = String(b[dateKey] || '').localeCompare(String(a[dateKey] || ''))
    if (date !== 0) return date
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
}

function normalizeWallet(wallet) {
  if (!wallet || typeof wallet !== 'object') return wallet
  const scope = wallet.scope || (wallet.type === 'savings' ? 'legacy_personal' : 'legacy_personal')
  return {
    ...wallet,
    scope,
    owner_id: scope === 'legacy_personal' ? (wallet.owner_id ?? GUEST_USER_ID) : null
  }
}

async function ensureSeeded() {
  const [categories, wallets, ledger] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('savings_ledger')
  ])
  const now = nowIso()
  if (!categories.length) await putManyGuest('categories', defaultGuestCategories(now))
  let normalizedWallets = wallets.map(normalizeWallet)
  let changed = normalizedWallets.length !== wallets.length
  for (let i = 0; i < normalizedWallets.length; i += 1) {
    if (JSON.stringify(normalizedWallets[i]) !== JSON.stringify(wallets[i])) changed = true
  }
  if (!normalizedWallets.some((w) => w.scope === 'family_main' && !w.is_archived)) {
    normalizedWallets = [...normalizedWallets, defaultGuestWallet(now)]
    changed = true
  }
  if (!normalizedWallets.some((w) => w.scope === 'family_savings' && !w.is_archived)) {
    normalizedWallets = [...normalizedWallets, defaultGuestSavingsWallet(now)]
    changed = true
  }
  if (!wallets.length) {
    await putManyGuest('wallets', normalizedWallets)
  } else if (changed) {
    await putManyGuest('wallets', normalizedWallets)
  }
  if (!Array.isArray(ledger)) await putManyGuest('savings_ledger', [])
}

export async function guestAvailable() {
  if (!hasIndexedDb()) return false
  try {
    await ensureSeeded()
    return true
  } catch {
    return false
  }
}

function matchesFilters(tx, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase()
  if (search && !`${tx.title || ''} ${tx.note || ''}`.toLowerCase().includes(search)) return false
  if (filters.type && tx.type !== filters.type) return false
  if (filters.from && tx.transaction_date < filters.from) return false
  if (filters.to && tx.transaction_date > filters.to) return false
  if (filters.categoryId && tx.category_id !== filters.categoryId) return false
  if (filters.walletId && tx.wallet_id !== filters.walletId) return false
  if (filters.memberId && tx.created_by !== filters.memberId) return false
  return true
}

export async function getGuestContext() {
  await ensureSeeded()
  const [categories, wallets, transactions, transfers, budgets, savingsLedger] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('budgets'),
    getAllGuest('savings_ledger')
  ])
  return {
    user: GUEST_USER,
    familyId: GUEST_FAMILY_ID,
    categories,
    wallets: wallets.map(normalizeWallet),
    transactions,
    transfers,
    budgets,
    savingsLedger
  }
}

export function guestMember() {
  return {
    user_id: GUEST_USER_ID,
    role: 'owner',
    status: 'active',
    profiles: { full_name: 'Tamu', email: '' }
  }
}

function isFamilyMain(wallet) { return wallet?.scope === 'family_main' }
function isFamilySavings(wallet) { return wallet?.scope === 'family_savings' }

export function guestWalletBalances(wallets, transactions, transfers, savingsLedger = []) {
  return wallets
    .filter((w) => !w.is_archived)
    .map((wallet) => {
      const txSum = transactions
        .filter((t) => !t.deleted_at && t.wallet_id === wallet.id)
        .reduce((sum, t) => sum + (t.type === 'income' ? asNumber(t.amount) : -asNumber(t.amount)), 0)
      const incoming = transfers
        .filter((t) => !t.deleted_at && t.to_wallet_id === wallet.id)
        .reduce((sum, t) => sum + asNumber(t.amount), 0)
      const outgoing = transfers
        .filter((t) => !t.deleted_at && t.from_wallet_id === wallet.id)
        .reduce((sum, t) => sum + asNumber(t.amount), 0)
      let ledgerDelta = 0
      if (isFamilyMain(wallet)) {
        ledgerDelta = savingsLedger
          .filter((s) => !s.deleted_at && s.main_wallet_id === wallet.id)
          .reduce((sum, s) => sum + (s.kind === 'withdraw_internal' ? asNumber(s.amount) : s.kind === 'deposit_internal' ? -asNumber(s.amount) : 0), 0)
      } else if (isFamilySavings(wallet)) {
        ledgerDelta = savingsLedger
          .filter((s) => !s.deleted_at && s.savings_wallet_id === wallet.id)
          .reduce((sum, s) => sum + (s.kind === 'withdraw_internal' ? -asNumber(s.amount) : asNumber(s.amount)), 0)
      }
      return {
        wallet_id: wallet.id,
        family_id: GUEST_FAMILY_ID,
        owner_id: wallet.owner_id ?? null,
        balance: asNumber(wallet.initial_balance) + txSum + incoming - outgoing + ledgerDelta
      }
    })
}

function categoryById(categories) { return new Map(categories.map((c) => [c.id, c])) }
function walletById(wallets) { return new Map(wallets.map((w) => [w.id, w])) }

export async function listGuestCategories() {
  await ensureSeeded()
  const categories = await getAllGuest('categories')
  return categories.filter((c) => !c.is_archived).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createGuestCategory(payload) {
  await ensureSeeded()
  const now = nowIso()
  const row = {
    id: makeGuestId('cat'),
    family_id: GUEST_FAMILY_ID,
    name: String(payload.name || '').trim(),
    type: payload.type === 'income' ? 'income' : 'expense',
    icon: null,
    color: payload.color || '#64748b',
    is_default: false,
    is_archived: false,
    created_at: now,
    updated_at: now
  }
  await putGuest('categories', row)
  return row
}

export async function archiveGuestCategory(id) {
  const categories = await getAllGuest('categories')
  const row = categories.find((c) => c.id === id)
  if (!row) return
  await putGuest('categories', { ...row, is_archived: true, updated_at: nowIso() })
}

export async function listGuestWallets({ includeArchived = false, type = null } = {}) {
  await ensureSeeded()
  const wallets = (await getAllGuest('wallets')).map(normalizeWallet)
  return wallets
    .filter((w) => (includeArchived || !w.is_archived))
    .filter((w) => !type || w.type === type)
    .sort((a, b) => {
      const order = { family_main: 0, family_savings: 1, legacy_personal: 2 }
      const da = order[a.scope] ?? 9
      const db = order[b.scope] ?? 9
      if (da !== db) return da - db
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
}

export async function saveGuestWallet(payload, editingId = null) {
  await ensureSeeded()
  const now = nowIso()
  const wallets = (await getAllGuest('wallets')).map(normalizeWallet)
  if (editingId) {
    const existing = wallets.find((w) => w.id === editingId)
    if (!existing) throw new Error('Dompet tidak ditemukan.')
    if (existing.scope === 'family_main' || existing.scope === 'family_savings') {
      throw new Error('Dompet keluarga dikelola otomatis.')
    }
    const row = {
      ...existing,
      name: String(payload.name || '').trim(),
      type: payload.type || existing.type,
      initial_balance: asNumber(payload.initial_balance),
      updated_at: now
    }
    await putGuest('wallets', row)
    return row
  }
  throw new Error('Dompet pribadi baru tidak didukung. Gunakan Dompet Utama Keluarga.')
}

export async function archiveGuestWallet(id) {
  const wallets = (await getAllGuest('wallets')).map(normalizeWallet)
  const row = wallets.find((w) => w.id === id)
  if (!row) return
  if (row.scope === 'family_main' || row.scope === 'family_savings') {
    throw new Error('Dompet keluarga tidak dapat diarsipkan.')
  }
  await putGuest('wallets', { ...row, is_archived: true, updated_at: nowIso() })
}

export async function listGuestTransfers(limit = 10) {
  await ensureSeeded()
  const transfers = await getAllGuest('transfers')
  return sortByDateDesc(transfers.filter((t) => !t.deleted_at), 'transfer_date').slice(0, limit)
}

export async function createGuestTransfer(payload) {
  await ensureSeeded()
  const [walletsRaw, transactions, transfers, savingsLedger] = await Promise.all([
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('savings_ledger')
  ])
  const wallets = walletsRaw.map(normalizeWallet)
  const amount = asNumber(payload.amount)
  if (!payload.from_wallet_id || !payload.to_wallet_id) throw new Error('Pilih dompet asal dan tujuan.')
  if (payload.from_wallet_id === payload.to_wallet_id) throw new Error('Dompet asal dan tujuan harus berbeda.')
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.')
  const balances = new Map(guestWalletBalances(wallets, transactions, transfers, savingsLedger).map((b) => [b.wallet_id, b.balance]))
  if (asNumber(balances.get(payload.from_wallet_id)) < amount) throw new Error('Saldo dompet asal tidak cukup.')
  const now = nowIso()
  const row = {
    id: makeGuestId('transfer'),
    family_id: GUEST_FAMILY_ID,
    from_wallet_id: payload.from_wallet_id,
    to_wallet_id: payload.to_wallet_id,
    created_by: GUEST_USER_ID,
    amount,
    transfer_date: payload.transfer_date || dateString(),
    note: payload.note || null,
    version: 1,
    client_op_id: makeGuestId('op'),
    deleted_at: null,
    created_at: now,
    updated_at: now
  }
  await putGuest('transfers', row)
  return row
}

function decorateTransaction(tx, categories, wallets) {
  const category = tx.category_id ? categoryById(categories).get(tx.category_id) : null
  const wallet = walletById(wallets).get(tx.wallet_id)
  return {
    ...tx,
    profiles: { full_name: 'Tamu', email: '' },
    categories: category ? { name: category.name } : null,
    wallets: wallet ? { name: wallet.name, type: wallet.type, scope: wallet.scope } : null
  }
}

export async function listGuestTransactions(filters = {}, limit = 100) {
  await ensureSeeded()
  const [categories, walletsRaw, transactions] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions')
  ])
  const wallets = walletsRaw.map(normalizeWallet)
  return sortByDateDesc(transactions.filter((t) => !t.deleted_at).filter((t) => matchesFilters(t, filters)))
    .slice(0, limit)
    .map((t) => decorateTransaction(t, categories, wallets))
}

export async function getGuestTransactionById(id) {
  const [categories, walletsRaw, transactions] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions')
  ])
  const tx = transactions.find((t) => t.id === id && !t.deleted_at)
  if (!tx) return null
  return decorateTransaction(tx, categories, walletsRaw.map(normalizeWallet))
}

export async function saveGuestTransaction(payload, editingId = null) {
  await ensureSeeded()
  const now = nowIso()
  if (editingId) {
    const transactions = await getAllGuest('transactions')
    const existing = transactions.find((t) => t.id === editingId)
    if (!existing) throw new Error('Transaksi tidak ditemukan.')
    const row = {
      ...existing,
      ...payload,
      amount: asNumber(payload.amount),
      updated_at: now
    }
    await putGuest('transactions', row)
    return row
  }
  const row = {
    id: makeGuestId('tx'),
    family_id: GUEST_FAMILY_ID,
    created_by: GUEST_USER_ID,
    wallet_id: payload.wallet_id,
    category_id: payload.category_id || null,
    type: payload.type === 'income' ? 'income' : 'expense',
    title: String(payload.title || '').trim(),
    amount: asNumber(payload.amount),
    transaction_date: payload.transaction_date || dateString(),
    note: payload.note || null,
    visibility: 'shared',
    version: 1,
    client_op_id: makeGuestId('op'),
    deleted_at: null,
    created_at: now,
    updated_at: now
  }
  await putGuest('transactions', row)
  return row
}

export async function deleteGuestTransaction(id) {
  const transactions = await getAllGuest('transactions')
  const row = transactions.find((t) => t.id === id)
  if (!row) return
  await putGuest('transactions', { ...row, deleted_at: nowIso(), updated_at: nowIso() })
}

function monthRange(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const end = new Date(year, month + 1, 0)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  return {
    start: fmt(new Date(year, month, 1)),
    end: fmt(end),
    today: fmt(today),
    label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date)
  }
}

export async function getGuestBudgetOverview(date = new Date()) {
  await ensureSeeded()
  const [budgets, categories, transactions] = await Promise.all([
    getAllGuest('budgets'),
    getAllGuest('categories'),
    getAllGuest('transactions')
  ])
  const range = monthRange(date)
  const active = budgets.filter((b) => !b.is_archived && b.start_date <= range.today && b.end_date >= range.today)
  const budgetsOut = active.map((b) => {
    const limit = asNumber(b.amount_limit)
    const spent = transactions
      .filter((t) => !t.deleted_at && t.type === 'expense' && t.transaction_date >= b.start_date && t.transaction_date <= b.end_date)
      .filter((t) => !b.category_id || t.category_id === b.category_id)
      .filter((t) => !b.member_id || t.created_by === b.member_id)
      .reduce((sum, t) => sum + asNumber(t.amount), 0)
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0
    const threshold = Number(b.alert_threshold) || 80
    const status = percent >= 100 ? 'danger' : percent >= threshold ? 'warn' : 'safe'
    const category = b.category_id ? categories.find((c) => c.id === b.category_id) : null
    return {
      ...b,
      limit,
      spent,
      remaining: limit - spent,
      percent,
      status,
      name: b.name || category?.name || 'Semua kategori',
      categoryName: category?.name || 'Semua kategori',
      memberName: 'Seluruh anggota'
    }
  })
  return {
    range,
    categories: categories.filter((c) => !c.is_archived),
    members: [guestMember()],
    budgets: budgetsOut,
    canManage: true,
    totals: budgetsOut.reduce((acc, b) => {
      acc.limit += b.limit
      acc.spent += b.spent
      acc.remaining += b.remaining
      return acc
    }, { limit: 0, spent: 0, remaining: 0 })
  }
}

export async function saveGuestBudget(payload, editingId = null) {
  await ensureSeeded()
  const now = nowIso()
  if (editingId) {
    const budgets = await getAllGuest('budgets')
    const existing = budgets.find((b) => b.id === editingId)
    if (!existing) throw new Error('Anggaran tidak ditemukan.')
    const row = { ...existing, ...payload, amount_limit: asNumber(payload.amount_limit), updated_at: now }
    await putGuest('budgets', row)
    return row
  }
  const row = {
    id: makeGuestId('budget'),
    family_id: GUEST_FAMILY_ID,
    category_id: payload.category_id || null,
    member_id: payload.member_id || null,
    name: payload.name || 'Anggaran',
    amount_limit: asNumber(payload.amount_limit),
    alert_threshold: Number(payload.alert_threshold) || 80,
    period_type: payload.period_type || 'monthly',
    start_date: payload.start_date,
    end_date: payload.end_date,
    is_archived: false,
    version: 1,
    created_at: now,
    updated_at: now
  }
  await putGuest('budgets', row)
  return row
}

export async function archiveGuestBudget(id) {
  const budgets = await getAllGuest('budgets')
  const row = budgets.find((b) => b.id === id)
  if (!row) return
  await putGuest('budgets', { ...row, is_archived: true, updated_at: nowIso() })
}

export async function listGuestSavingsLedger(limit = 30) {
  await ensureSeeded()
  const [ledger, categories] = await Promise.all([getAllGuest('savings_ledger'), getAllGuest('categories')])
  const catMap = new Map(categories.map((c) => [c.id, c]))
  return sortByDateDesc(ledger.filter((s) => !s.deleted_at), 'entry_date')
    .slice(0, limit)
    .map((row) => ({
      ...row,
      categories: row.category_id ? { name: catMap.get(row.category_id)?.name ?? 'Kategori' } : null,
      profiles: { full_name: 'Tamu', email: '' }
    }))
}

function getFamilyWallet(wallets, scope) {
  const wallet = wallets.find((w) => !w.is_archived && w.scope === scope)
  if (!wallet) throw new Error(scope === 'family_main' ? 'Dompet Utama Keluarga tidak ditemukan.' : 'Tabungan Keluarga tidak ditemukan.')
  return wallet
}

async function computeGuestBalances() {
  const [walletsRaw, transactions, transfers, savingsLedger] = await Promise.all([
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('savings_ledger')
  ])
  const wallets = walletsRaw.map(normalizeWallet)
  return { wallets, transactions, transfers, savingsLedger, balances: guestWalletBalances(wallets, transactions, transfers, savingsLedger) }
}

async function createSavingsLedgerEntry(payload) {
  await ensureSeeded()
  const amount = asNumber(payload.amount)
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.')
  const { wallets, balances } = await computeGuestBalances()
  const main = getFamilyWallet(wallets, 'family_main')
  const savings = getFamilyWallet(wallets, 'family_savings')
  const mainBalance = asNumber(balances.find((b) => b.wallet_id === main.id)?.balance)
  const savingsBalance = asNumber(balances.find((b) => b.wallet_id === savings.id)?.balance)

  if (payload.kind === 'deposit_internal' && mainBalance < amount) throw new Error('Saldo Dompet Utama tidak cukup.')
  if (payload.kind === 'withdraw_internal' && savingsBalance < amount) throw new Error('Saldo Tabungan tidak cukup.')
  if (payload.kind === 'deposit_external' && !payload.category_id) throw new Error('Kategori sumber dana wajib diisi.')

  const now = nowIso()
  const row = {
    id: makeGuestId('save'),
    family_id: GUEST_FAMILY_ID,
    main_wallet_id: main.id,
    savings_wallet_id: savings.id,
    category_id: payload.kind === 'deposit_external' ? payload.category_id : null,
    created_by: GUEST_USER_ID,
    kind: payload.kind,
    amount,
    entry_date: payload.entry_date || dateString(),
    note: payload.note || null,
    client_op_id: makeGuestId('op'),
    version: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now
  }
  await putGuest('savings_ledger', row)
  return row
}

export async function guestDepositInternal(payload) {
  return createSavingsLedgerEntry({ ...payload, kind: 'deposit_internal' })
}

export async function guestDepositExternal(payload) {
  return createSavingsLedgerEntry({ ...payload, kind: 'deposit_external' })
}

export async function guestWithdrawInternal(payload) {
  return createSavingsLedgerEntry({ ...payload, kind: 'withdraw_internal' })
}

export async function buildGuestReportData(filters = {}) {
  await ensureSeeded()
  const [categories, walletsRaw, transactions, transfers, savingsLedger] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('savings_ledger')
  ])
  const wallets = walletsRaw.map(normalizeWallet)
  const balances = guestWalletBalances(wallets, transactions, transfers, savingsLedger)
  const catMap = categoryById(categories)
  const walMap = walletById(wallets)

  const txRows = sortByDateDesc(transactions.filter((t) => !t.deleted_at).filter((t) => matchesFilters(t, filters)))
    .map((t) => decorateTransaction(t, categories, wallets))

  const incomeLedgerRows = savingsLedger
    .filter((s) => !s.deleted_at && s.kind === 'deposit_external')
    .filter((s) => !filters.from || s.entry_date >= filters.from)
    .filter((s) => !filters.to || s.entry_date <= filters.to)
    .filter((s) => !filters.categoryId || s.category_id === filters.categoryId)
    .filter((s) => !filters.walletId || s.savings_wallet_id === filters.walletId)
    .filter((s) => !filters.memberId || s.created_by === filters.memberId)
    .map((s) => {
      const category = s.category_id ? catMap.get(s.category_id) : null
      const wallet = walMap.get(s.savings_wallet_id)
      return {
        id: `ledger-${s.id}`,
        source_kind: 'savings_ledger',
        family_id: GUEST_FAMILY_ID,
        wallet_id: s.savings_wallet_id,
        category_id: s.category_id || null,
        created_by: s.created_by,
        type: 'income',
        title: s.note || 'Setoran tabungan (eksternal)',
        amount: asNumber(s.amount),
        transaction_date: s.entry_date,
        note: s.note || null,
        visibility: 'shared',
        profiles: { full_name: 'Tamu', email: '' },
        categories: category ? { name: category.name } : null,
        wallets: wallet ? { name: wallet.name, type: wallet.type, scope: wallet.scope } : null
      }
    })

  const merged = sortByDateDesc([...txRows, ...incomeLedgerRows], 'transaction_date')

  return {
    user: GUEST_USER,
    familyId: GUEST_FAMILY_ID,
    categories,
    wallets,
    transactions: merged,
    rawTransactions: txRows,
    transfers,
    savingsLedger,
    balances,
    members: [guestMember()]
  }
}


export async function getGuestSavingsState() {
  await ensureSeeded()
  const [walletsRaw, transactions, transfers, savingsLedger] = await Promise.all([
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('savings_ledger')
  ])
  const wallets = walletsRaw.map(normalizeWallet)
  const balances = guestWalletBalances(wallets, transactions, transfers, savingsLedger)
  const main = wallets.find((w) => w.scope === 'family_main')
  const savings = wallets.find((w) => w.scope === 'family_savings')
  return {
    mainBalance: balances.find((b) => b.wallet_id === main?.id)?.balance ?? 0,
    savingsBalance: balances.find((b) => b.wallet_id === savings?.id)?.balance ?? 0
  }
}
