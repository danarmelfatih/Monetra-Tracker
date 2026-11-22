import { expect, test } from 'bun:test'
import { isSavingsWallet, splitWalletBalances, walletKindLabel } from '../public/js/lib/wallet-summary.js'

test('splitWalletBalances memisahkan tabungan dari saldo siap pakai', () => {
  const wallets = [
    { id: 'w1', type: 'bank' },
    { id: 'w2', type: 'savings' },
    { id: 'w3', type: 'cash' }
  ]
  const balances = [
    { wallet_id: 'w1', balance: 2500000 },
    { wallet_id: 'w2', balance: 7000000 },
    { wallet_id: 'w3', balance: 500000 }
  ]

  const result = splitWalletBalances(wallets, balances)

  expect(result.saldoTotal).toBe(3000000)
  expect(result.savingsTotal).toBe(7000000)
  expect(result.saldoCount).toBe(2)
  expect(result.savingsCount).toBe(1)
  expect(result.saldoBalances.map((row) => row.wallet_id)).toEqual(['w1', 'w3'])
  expect(result.savingsBalances.map((row) => row.wallet_id)).toEqual(['w2'])
})

test('splitWalletBalances menganggap wallet tanpa tipe sebagai saldo', () => {
  const result = splitWalletBalances(
    [{ id: 'w1' }, { id: 'w2', type: 'savings' }],
    [{ wallet_id: 'w1', balance: 1000 }, { wallet_id: 'w2', balance: 2000 }, { wallet_id: 'w3', balance: 3000 }]
  )

  expect(result.saldoTotal).toBe(4000)
  expect(result.savingsTotal).toBe(2000)
  expect(isSavingsWallet({ type: 'savings' })).toBe(true)
  expect(isSavingsWallet({ type: 'bank' })).toBe(false)
  expect(walletKindLabel('savings')).toBe('Tabungan')
  expect(walletKindLabel('bank')).toBe('Dompet')
})
