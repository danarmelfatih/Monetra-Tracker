import { expect, test } from 'bun:test'
import {
  buildReport,
  exportData,
  rangeForPreset,
  toCsv,
  toExcel
} from '../public/js/lib/report.js'

const transactions = [
  {
    id: 't1', title: 'Gaji', amount: 1000000, type: 'income', transaction_date: '2026-11-01',
    note: '', visibility: 'shared', category_id: null, wallet_id: 'w1', created_by: 'u1',
    categories: null, wallets: { name: 'BCA' }, profiles: { full_name: 'Andi' }
  },
  {
    id: 't2', title: 'Belanja', amount: 250000, type: 'expense', transaction_date: '2026-11-02',
    note: '', visibility: 'private', category_id: 'c1', wallet_id: 'w1', created_by: 'u1',
    categories: { name: 'Makanan' }, wallets: { name: 'BCA' }, profiles: { full_name: 'Andi' }
  },
  {
    id: 't3', title: 'Bensin', amount: 100000, type: 'expense', transaction_date: '2026-12-03',
    note: '', visibility: 'shared', category_id: 'c2', wallet_id: 'w2', created_by: 'u2',
    categories: { name: 'Transportasi' }, wallets: { name: 'BNI' }, profiles: { full_name: 'Budi' }
  }
]

const wallets = [
  { id: 'w1', name: 'BCA', type: 'bank' },
  { id: 'w2', name: 'BNI', type: 'bank' },
  { id: 'w3', name: 'Tabungan Rumah', type: 'savings' }
]
const balances = [
  { wallet_id: 'w1', balance: 5000000 },
  { wallet_id: 'w2', balance: 2000000 },
  { wallet_id: 'w3', balance: 7500000 }
]
const categories = [{ id: 'c1', name: 'Makanan' }, { id: 'c2', name: 'Transportasi' }]
const members = [
  { user_id: 'u1', profiles: { full_name: 'Andi' } },
  { user_id: 'u2', profiles: { full_name: 'Budi' } }
]

test('rangeForPreset menghasilkan rentang harian, mingguan, bulanan, dan tahunan', () => {
  const today = new Date(2026, 10, 18)
  expect(rangeForPreset('harian', today)).toEqual({ start: '2026-11-18', end: '2026-11-18' })
  expect(rangeForPreset('mingguan', today)).toEqual({ start: '2026-11-16', end: '2026-11-22' })
  expect(rangeForPreset('bulanan', today)).toEqual({ start: '2026-11-01', end: '2026-11-30' })
  expect(rangeForPreset('tahunan', today)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  expect(rangeForPreset('custom', today)).toBe(null)
})

test('buildReport mengagregasi pemasukan, pengeluaran, kategori, bulan, anggota, dan dompet', () => {
  const report = buildReport({ transactions, wallets, balances, categories, members })

  expect(report.summary).toEqual({ income: 1000000, expense: 350000, count: 3, net: 650000 })
  expect(report.byCategory[0]).toEqual({ name: 'Makanan', total: 250000, count: 1 })
  expect(report.byMonth).toHaveLength(2)
  expect(report.byMonth[0].label).toBe('Nov 2026')
  expect(report.byMonth[0].net).toBe(750000)
  expect(report.byMonth[1].net).toBe(-100000)
  expect(report.byMember[0]).toEqual({ id: 'u1', name: 'Andi', income: 1000000, expense: 250000, count: 2 })
  expect(report.byWallet[0]).toEqual({
    id: 'w1', name: 'BCA', type: 'bank', kind: 'Dompet', scope: 'legacy_personal',
    balance: 5000000, income: 1000000, expense: 250000, count: 2
  })
  expect(report.byWallet[2]).toEqual({
    id: 'w3', name: 'Tabungan Rumah', type: 'savings', kind: 'Tabungan', scope: 'legacy_personal',
    balance: 7500000, income: 0, expense: 0, count: 0
  })
  expect(report.details[1].visibility).toBe('Pribadi')
})

test('exportData mengikuti jenis laporan yang dipilih', () => {
  const report = buildReport({ transactions, wallets, balances, categories, members })
  const pengeluaran = exportData('pengeluaran', report)
  const saldo = exportData('saldo', report)
  const kategori = exportData('kategori', report)
  const anggota = exportData('anggota', report)

  expect(pengeluaran.headers).toContain('Jumlah')
  expect(pengeluaran.rows).toHaveLength(2)
  expect(saldo.headers).toContain('Jenis')
  expect(saldo.rows).toHaveLength(3)
  expect(saldo.rows[0]).toEqual(['Dompet', 'BCA', 5000000, 1000000, 250000, 750000])
  expect(saldo.rows[2]).toEqual(['Tabungan', 'Tabungan Rumah', 7500000, 0, 0, 0])
  expect(kategori.rows[0]).toEqual(['Makanan', 250000, 1])
  expect(anggota.rows[0]).toEqual(['Andi', 2, 1000000, 250000])
})

test('toCsv meng-escape koma, kutip, dan baris baru', () => {
  const csv = toCsv(['Nama', 'Catatan'], [
    ['A, B', ' kata "penting"'],
    ['C', 'baris\nbaru']
  ])
  expect(csv).toBe('Nama,Catatan\r\n"A, B"," kata ""penting"""\r\nC,"baris\nbaru"')
})

test('toExcel meng-escape HTML pada judul dan sel', () => {
  const excel = toExcel(['<b>'], [['&"']], '<title>')
  expect(excel).toContain('&lt;title&gt;')
  expect(excel).toContain('&lt;b&gt;')
  expect(excel).toContain('&amp;&quot;')
})
