import { test, expect } from 'bun:test'
import { summarizeFamilyBalances } from '../public/js/lib/wallet-summary.js'

test('family main dan savings tidak dijumlahkan sebagai satu saldo siap pakai', () => {
  const wallets = [
    { id: 'm', name: 'Dompet Utama Keluarga', scope: 'family_main', type: 'cash', is_archived: false },
    { id: 's', name: 'Tabungan Keluarga', scope: 'family_savings', type: 'savings', is_archived: false }
  ]
  const balances = [{ wallet_id: 'm', balance: 300000 }, { wallet_id: 's', balance: 200000 }]
  const summary = summarizeFamilyBalances(wallets, balances)
  expect(summary.main.balance).toBe(300000)
  expect(summary.savings.balance).toBe(200000)
  expect(summary.main.balance + summary.savings.balance).toBe(500000)
  expect(summary.ready).toBeUndefined()
})

test('legacy wallet tetap terpisah dari dompet keluarga', () => {
  const summary = summarizeFamilyBalances(
    [
      { id: 'm', scope: 'family_main', type: 'cash' },
      { id: 's', scope: 'family_savings', type: 'savings' },
      { id: 'l', scope: 'legacy_personal', type: 'bank', name: 'Dompet Lama' }
    ],
    [{ wallet_id: 'm', balance: 1 }, { wallet_id: 's', balance: 2 }, { wallet_id: 'l', balance: 3 }]
  )
  expect(summary.legacy.map((w) => w.id)).toEqual(['l'])
  expect(summary.main.id).toBe('m')
  expect(summary.savings.id).toBe('s')
})
