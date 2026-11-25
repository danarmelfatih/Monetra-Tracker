import { afterEach, beforeEach, expect, test } from 'bun:test'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
import { clearGuestStores } from '../public/js/lib/guest-db.js'
import {
  archiveGuestBudget,
  archiveGuestWallet,
  createGuestCategory,
  createGuestTransfer,
  deleteGuestTransaction,
  getGuestBudgetOverview,
  guestWalletBalances,
  listGuestCategories,
  listGuestTransactions,
  listGuestWallets,
  saveGuestBudget,
  saveGuestTransaction,
  saveGuestWallet,
  guestDepositInternal,
  guestDepositExternal,
  guestWithdrawInternal,
  buildGuestReportData,
  getGuestSavingsState
} from '../public/js/lib/guest-store.js'

beforeEach(async () => {
  globalThis.indexedDB = indexedDB
  globalThis.IDBKeyRange = IDBKeyRange
  await clearGuestStores()
})

afterEach(async () => {
  await clearGuestStores()
  delete globalThis.indexedDB
  delete globalThis.IDBKeyRange
})

test('guest wallet dan transaksi memengaruhi saldo dompet utama keluarga', async () => {
  const wallets = await listGuestWallets()
  const main = wallets.find((w) => w.scope === 'family_main')
  await saveGuestTransaction({ wallet_id: main.id, type: 'income', title: 'Gaji', amount: 50000, transaction_date: '2026-11-01' })
  await saveGuestTransaction({ wallet_id: main.id, type: 'expense', title: 'Makan', amount: 20000, transaction_date: '2026-11-02' })
  const tx = await listGuestTransactions()
  const balances = guestWalletBalances(await listGuestWallets(), tx, [], await (await import('../public/js/lib/guest-store.js')).listGuestSavingsLedger?.() || [])
  expect(balances.find((b) => b.wallet_id === main.id)?.balance).toBe(30000)
})

test('guest tidak mendukung dompet pribadi baru', async () => {
  await expect(saveGuestWallet({ name: 'Dompet Baru', type: 'cash', initial_balance: 0 })).rejects.toThrow()
})

test('guest budget menghitung pengeluaran relevan', async () => {
  const category = await createGuestCategory({ name: 'Makan', type: 'expense', color: '#E45D62' })
  const wallets = await listGuestWallets()
  const main = wallets.find((w) => w.scope === 'family_main')
  await saveGuestBudget({ name: 'Makan', category_id: category.id, member_id: null, amount_limit: 100000, alert_threshold: 80, start_date: '2026-11-01', end_date: '2026-11-30' })
  await saveGuestTransaction({ wallet_id: main.id, category_id: category.id, type: 'expense', title: 'Nasi', amount: 30000, transaction_date: '2026-11-05' })
  const overview = await getGuestBudgetOverview(new Date(2026, 10, 10))
  expect(overview.budgets[0].spent).toBe(30000)
  expect(overview.budgets[0].remaining).toBe(70000)
})

test('guest CRUD kategori dan transaksi bekerja', async () => {
  const category = await createGuestCategory({ name: 'Hadiah', type: 'income', color: '#16A36A' })
  const wallets = await listGuestWallets()
  const main = wallets.find((w) => w.scope === 'family_main')
  await archiveGuestBudget((await getGuestBudgetOverview()).budgets[0]?.id || (await saveGuestBudget({ name: 'X', category_id: null, member_id: null, amount_limit: 1, alert_threshold: 80, start_date: '2026-11-01', end_date: '2026-11-30' })).id)
  expect((await listGuestCategories()).some((c) => c.id === category.id)).toBe(true)
  const tx = await saveGuestTransaction({ wallet_id: main.id, type: 'expense', title: 'Tes', amount: 1000, transaction_date: '2026-11-01' })
  await deleteGuestTransaction(tx.id)
  expect((await listGuestTransactions()).some((t) => t.id === tx.id)).toBe(false)
})

test('guest savings ledger: internal/external/withdraw mempengaruhi saldo dan laporan dengan benar', async () => {
  await clearGuestStores()
  const wallets = await listGuestWallets()
  const main = wallets.find((w) => w.scope === 'family_main')
  const savings = wallets.find((w) => w.scope === 'family_savings')
  const categories = await listGuestCategories()
  const incomeCat = categories.find((c) => c.type === 'income')

  await saveGuestTransaction({ wallet_id: main.id, category_id: incomeCat.id, type: 'income', title: 'Gaji', amount: 1000000, transaction_date: '2026-11-01', note: null, visibility: 'shared' })
  await guestDepositInternal({ amount: 200000, entry_date: '2026-11-02', note: 'setor' })
  await guestDepositExternal({ amount: 150000, entry_date: '2026-11-03', category_id: incomeCat.id, note: 'bonus' })
  await guestWithdrawInternal({ amount: 50000, entry_date: '2026-11-04', note: 'tarik' })

  const state = await getGuestSavingsState()
  expect(state.mainBalance).toBe(850000)
  expect(state.savingsBalance).toBe(300000)

  const report = await buildGuestReportData({ from: '2026-11-01', to: '2026-11-30' })
  const income = report.transactions.filter((t) => t.type === 'income')
  expect(income).toHaveLength(2)
  expect(income.some((t) => t.source_kind === 'savings_ledger' && Number(t.amount) === 150000)).toBe(true)
  expect(income.some((t) => t.source_kind === 'savings_ledger' && Number(t.amount) === 200000)).toBe(false)
})
