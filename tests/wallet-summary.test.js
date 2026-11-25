import { test, expect } from 'bun:test'
import { isSavingsWallet, isFamilyMainWallet, isFamilySavingsWallet, isLegacyPersonalWallet, walletScopeLabel, summarizeFamilyBalances, summarizeWalletBalances } from '../public/js/lib/wallet-summary.js'

test('isSavingsWallet mengenali tabungan dari tipe atau nama', () => {
  expect(isSavingsWallet({ type: 'savings', name: 'BCA' })).toBe(true)
  expect(isSavingsWallet({ type: 'bank', name: 'Tabungan Rumah' })).toBe(true)
  expect(isSavingsWallet({ type: 'bank', name: 'BCA' })).toBe(false)
})

test('scope helper mengenali dompet keluarga dan legacy', () => {
  expect(isFamilyMainWallet({ scope: 'family_main' })).toBe(true)
  expect(isFamilySavingsWallet({ scope: 'family_savings' })).toBe(true)
  expect(isLegacyPersonalWallet({ scope: 'legacy_personal' })).toBe(true)
  expect(walletScopeLabel({ scope: 'family_main' })).toBe('Dompet Utama Keluarga')
})

test('summarizeFamilyBalances memisahkan main, savings, legacy', () => {
  const summary = summarizeFamilyBalances(
    [
      { id: 'm', name: 'Dompet Utama Keluarga', scope: 'family_main', type: 'cash' },
      { id: 's', name: 'Tabungan Keluarga', scope: 'family_savings', type: 'savings' },
      { id: 'l', name: 'Dompet Lama', scope: 'legacy_personal', type: 'bank' }
    ],
    [{ wallet_id: 'm', balance: 100 }, { wallet_id: 's', balance: 50 }, { wallet_id: 'l', balance: 20 }]
  )
  expect(summary.main.id).toBe('m')
  expect(summary.savings.id).toBe('s')
  expect(summary.legacy).toHaveLength(1)
  expect(summary.total).toBe(170)
  expect(summary.legacy[0].balance).toBe(20)
})

test('summarizeWalletBalances tetap memisahkan saldo siap pakai dan tabungan', () => {
  const summary = summarizeWalletBalances(
    [
      { id: 'a', name: 'Kas', type: 'cash', is_archived: false },
      { id: 'b', name: 'Tabungan', type: 'savings', is_archived: false },
      { id: 'c', name: 'Lama', type: 'bank', is_archived: true }
    ],
    [
      { wallet_id: 'a', balance: 100000 },
      { wallet_id: 'b', balance: 50000 },
      { wallet_id: 'c', balance: 999 }
    ]
  )

  expect(summary.ready).toBe(100000)
  expect(summary.savings).toBe(50000)
  expect(summary.total).toBe(150000)
  expect(summary.savingsCount).toBe(1)
})
