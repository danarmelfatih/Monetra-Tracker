import { GUEST_FAMILY_ID, GUEST_USER, GUEST_USER_ID } from './guest.js'
import { getAllGuest, hasIndexedDb, makeGuestId, nowIso, putGuest, putManyGuest } from './guest-db.js'
import { defaultGuestCategories, defaultGuestWallet } from './guest-seed.js'

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

async function ensureSeeded() {
  const [categories, wallets] = await Promise.all([getAllGuest('categories'), getAllGuest('wallets')])
  const now = nowIso()
  if (!categories.length) await putManyGuest('categories', defaultGuestCategories(now))
  if (!wallets.length) await putGuest('wallets', defaultGuestWallet(now))
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
  const [categories, wallets, transactions, transfers, budgets] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('budgets')
  ])
  return {
    user: GUEST_USER,
    familyId: GUEST_FAMILY_ID,
    categories,
    wallets,
    transactions,
    transfers,
    budgets
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

export function guestWalletBalances(wallets, transactions, transfers) {
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
      return {
        wallet_id: wallet.id,
        family_id: GUEST_FAMILY_ID,
        owner_id: wallet.owner_id,
        balance: asNumber(wallet.initial_balance) + txSum + incoming - outgoing
      }
    })
}

function categoryById(categories) {
  return new Map(categories.map((c) => [c.id, c]))
}

function walletById(wallets) {
  return new Map(wallets.map((w) => [w.id, w]))
}

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
  const wallets = await getAllGuest('wallets')
  return wallets
    .filter((w) => (includeArchived || !w.is_archived))
    .filter((w) => !type || w.type === type)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

export async function saveGuestWallet(payload, editingId = null) {
  await ensureSeeded()
  const now = nowIso()
  const wallets = await getAllGuest('wallets')
  if (editingId) {
    const existing = wallets.find((w) => w.id === editingId)
    if (!existing) throw new Error('Dompet tidak ditemukan.')
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
  const row = {
    id: makeGuestId('wallet'),
    family_id: GUEST_FAMILY_ID,
    owner_id: GUEST_USER_ID,
    name: String(payload.name || '').trim(),
    type: payload.type || 'cash',
    initial_balance: asNumber(payload.initial_balance),
    is_archived: false,
    version: 1,
    created_at: now,
    updated_at: now
  }
  await putGuest('wallets', row)
  return row
}

export async function archiveGuestWallet(id) {
  const wallets = await getAllGuest('wallets')
  const row = wallets.find((w) => w.id === id)
  if (!row) return
  await putGuest('wallets', { ...row, is_archived: true, updated_at: nowIso() })
}

export async function listGuestTransfers(limit = 10) {
  await ensureSeeded()
  const transfers = await getAllGuest('transfers')
  return sortByDateDesc(transfers.filter((t) => !t.deleted_at), 'transfer_date').slice(0, limit)
}

export async function createGuestTransfer(payload) {
  await ensureSeeded()
  const [wallets, transactions, transfers] = await Promise.all([
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers')
  ])
  const amount = asNumber(payload.amount)
  if (!payload.from_wallet_id || !payload.to_wallet_id) throw new Error('Pilih dompet asal dan tujuan.')
  if (payload.from_wallet_id === payload.to_wallet_id) throw new Error('Dompet asal dan tujuan harus berbeda.')
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.')
  const balances = new Map(guestWalletBalances(wallets, transactions, transfers).map((b) => [b.wallet_id, b.balance]))
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
    wallets: wallet ? { name: wallet.name } : null
  }
}

export async function listGuestTransactions(filters = {}, limit = 100) {
  await ensureSeeded()
  const [categories, wallets, transactions] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions')
  ])
  return sortByDateDesc(transactions.filter((t) => !t.deleted_at).filter((t) => matchesFilters(t, filters)))
    .slice(0, limit)
    .map((t) => decorateTransaction(t, categories, wallets))
}

export async function getGuestTransactionById(id) {
  const [categories, wallets, transactions] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions')
  ])
  const tx = transactions.find((t) => t.id === id)
  return tx ? decorateTransaction(tx, categories, wallets) : null
}

export async function saveGuestTransaction(payload, editingId = null) {
  await ensureSeeded()
  const transactions = await getAllGuest('transactions')
  const now = nowIso()
  const amount = asNumber(payload.amount)
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.')
  if (editingId) {
    const existing = transactions.find((t) => t.id === editingId)
    if (!existing) throw new Error('Transaksi tidak ditemukan.')
    const row = {
      ...existing,
      category_id: payload.category_id || null,
      type: payload.type === 'income' ? 'income' : 'expense',
      title: String(payload.title || '').trim(),
      amount,
      transaction_date: payload.transaction_date || dateString(),
      note: payload.note || null,
      visibility: payload.visibility || 'private',
      updated_at: now,
      version: asNumber(existing.version) + 1
    }
    await putGuest('transactions', row)
    return row
  }
  const row = {
    id: makeGuestId('tx'),
    family_id: GUEST_FAMILY_ID,
    wallet_id: payload.wallet_id,
    category_id: payload.category_id || null,
    created_by: GUEST_USER_ID,
    type: payload.type === 'income' ? 'income' : 'expense',
    title: String(payload.title || '').trim(),
    amount,
    transaction_date: payload.transaction_date || dateString(),
    note: payload.note || null,
    visibility: payload.visibility || 'private',
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
  const to = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    start: to(new Date(year, month, 1)),
    end: to(new Date(year, month + 1, 0)),
    today: to(date),
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
  const members = [guestMember()]
  const active = budgets.filter((b) => !b.is_archived && b.start_date <= range.today && b.end_date >= range.today)
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const rows = active.map((b) => {
    const limit = asNumber(b.amount_limit)
    const spent = transactions
      .filter((t) => !t.deleted_at && t.type === 'expense')
      .filter((t) => t.transaction_date >= b.start_date && t.transaction_date <= b.end_date)
      .filter((t) => !b.category_id || t.category_id === b.category_id)
      .filter((t) => !b.member_id || t.created_by === b.member_id)
      .reduce((sum, t) => sum + asNumber(t.amount), 0)
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0
    const threshold = asNumber(b.alert_threshold) || 80
    const status = percent >= 100 ? 'danger' : percent >= threshold ? 'warn' : 'safe'
    return {
      ...b,
      limit,
      spent,
      remaining: limit - spent,
      percent,
      status,
      categoryName: categoryNames.get(b.category_id) || 'Semua kategori',
      memberName: 'Seluruh anggota'
    }
  })
  return {
    range,
    categories: categories.filter((c) => !c.is_archived),
    members,
    budgets: rows,
    canManage: true,
    totals: rows.reduce((acc, b) => {
      acc.limit += b.limit
      acc.spent += b.spent
      acc.remaining += b.remaining
      return acc
    }, { limit: 0, spent: 0, remaining: 0 })
  }
}

export async function saveGuestBudget(payload) {
  await ensureSeeded()
  const budgets = await getAllGuest('budgets')
  const now = nowIso()
  const existing = budgets.find((b) =>
    !b.is_archived &&
    b.period_type === 'monthly' &&
    b.start_date === payload.start_date &&
    b.end_date === payload.end_date &&
    (b.category_id || null) === (payload.category_id || null) &&
    (b.member_id || null) === (payload.member_id || null)
  )
  const row = {
    id: existing?.id || makeGuestId('budget'),
    family_id: GUEST_FAMILY_ID,
    category_id: payload.category_id || null,
    member_id: payload.member_id || null,
    name: payload.name,
    amount_limit: asNumber(payload.amount_limit),
    period_type: 'monthly',
    start_date: payload.start_date,
    end_date: payload.end_date,
    alert_threshold: asNumber(payload.alert_threshold) || 80,
    is_archived: false,
    created_by: GUEST_USER_ID,
    version: asNumber(existing?.version) + 1 || 1,
    created_at: existing?.created_at || now,
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

export async function buildGuestReportData(filters = {}) {
  await ensureSeeded()
  const [categories, wallets, transactions, transfers, budgets] = await Promise.all([
    getAllGuest('categories'),
    getAllGuest('wallets'),
    getAllGuest('transactions'),
    getAllGuest('transfers'),
    getAllGuest('budgets')
  ])
  const balances = guestWalletBalances(wallets, transactions, transfers)
  const activeTx = sortByDateDesc(transactions.filter((t) => !t.deleted_at).filter((t) => matchesFilters(t, filters)))
  return {
    categories,
    wallets,
    transactions: activeTx.map((t) => decorateTransaction(t, categories, wallets)),
    transfers,
    budgets,
    balances,
    members: [guestMember()]
  }
}