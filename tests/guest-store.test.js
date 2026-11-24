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
  saveGuestWallet
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

test('guest wallet dan transaksi memengaruhi saldo', async () => {
  const wallet = await saveGuestWallet({ name: 'Tunai', type: 'cash', initial_balance: 100000 })
  await saveGuestTransaction({ wallet_id: wallet.id, type: 'income', title: 'Gaji', amount: 50000, transaction_date: '2026-11-01' })
  await saveGuestTransaction({ wallet_id: wallet.id, type: 'expense', title: 'Makan', amount: 20000, transaction_date: '2026-11-02' })
  const wallets = await listGuestWallets()
  const tx = await listGuestTransactions()
  const balances = guestWalletBalances(wallets, tx, [])
  expect(balances.find((b) => b.wallet_id === wallet.id)?.balance).toBe(130000)
})

test('guest transfer memindahkan saldo antar dompet', async () => {
  const from = await saveGuestWallet({ name: 'Bank', type: 'bank', initial_balance: 100000 })
  const to = await saveGuestWallet({ name: 'Tabungan', type: 'savings', initial_balance: 0 })
  await createGuestTransfer({ from_wallet_id: from.id, to_wallet_id: to.id, amount: 25000, transfer_date: '2026-11-03' })
  const wallets = await listGuestWallets({ includeArchived: true })
  const balances = guestWalletBalances(wallets, await listGuestTransactions(), [{ from_wallet_id: from.id, to_wallet_id: to.id, amount: 25000, deleted_at: null }])
  expect(balances.find((b) => b.wallet_id === from.id)?.balance).toBe(75000)
  expect(balances.find((b) => b.wallet_id === to.id)?.balance).toBe(25000)
})

test('guest budget menghitung pengeluaran relevan', async () => {
  const category = await createGuestCategory({ name: 'Makan', type: 'expense', color: '#E45D62' })
  const wallet = await saveGuestWallet({ name: 'Tunai', type: 'cash', initial_balance: 0 })
  await saveGuestBudget({ name: 'Makan', category_id: category.id, member_id: null, amount_limit: 100000, alert_threshold: 80, start_date: '2026-11-01', end_date: '2026-11-30' })
  await saveGuestTransaction({ wallet_id: wallet.id, category_id: category.id, type: 'expense', title: 'Nasi', amount: 30000, transaction_date: '2026-11-05' })
  const overview = await getGuestBudgetOverview(new Date(2026, 10, 10))
  expect(overview.budgets[0].spent).toBe(30000)
  expect(overview.budgets[0].remaining).toBe(70000)
})

test('guest CRUD kategori dan arsip dompet bekerja', async () => {
  const category = await createGuestCategory({ name: 'Hadiah', type: 'income', color: '#16A36A' })
  const wallet = await saveGuestWallet({ name: 'Dompet Lama', type: 'cash', initial_balance: 0 })
  await archiveGuestWallet(wallet.id)
  await archiveGuestBudget((await getGuestBudgetOverview()).budgets[0]?.id || (await saveGuestBudget({ name: 'X', category_id: null, member_id: null, amount_limit: 1, alert_threshold: 80, start_date: '2026-11-01', end_date: '2026-11-30' })).id)
  expect((await listGuestCategories()).some((c) => c.id === category.id)).toBe(true)
  expect((await listGuestWallets()).some((w) => w.id === wallet.id)).toBe(false)
  const tx = await saveGuestTransaction({ wallet_id: wallet.id, type: 'expense', title: 'Tes', amount: 1000, transaction_date: '2026-11-01' })
  await deleteGuestTransaction(tx.id)
  expect((await listGuestTransactions()).some((t) => t.id === tx.id)).toBe(false)
})