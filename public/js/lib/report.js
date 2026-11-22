const pad = (value) => String(value).padStart(2, '0')

const toDateString = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

export const REPORT_TYPES = [
  { id: 'pemasukan', label: 'Laporan pemasukan' },
  { id: 'pengeluaran', label: 'Laporan pengeluaran' },
  { id: 'saldo', label: 'Laporan saldo' },
  { id: 'perbandingan', label: 'Perbandingan bulanan' },
  { id: 'kategori', label: 'Pengeluaran per kategori' },
  { id: 'anggota', label: 'Aktivitas anggota' },
  { id: 'dompet', label: 'Laporan dompet' }
]

export function rangeForPreset(preset, today = new Date()) {
  const year = today.getFullYear()
  const month = today.getMonth()
  if (preset === 'harian') {
    const value = toDateString(today)
    return { start: value, end: value }
  }
  if (preset === 'mingguan') {
    const day = (today.getDay() + 6) % 7
    const start = addDays(today, -day)
    return { start: toDateString(start), end: toDateString(addDays(start, 6)) }
  }
  if (preset === 'tahunan') {
    return {
      start: toDateString(new Date(year, 0, 1)),
      end: toDateString(new Date(year, 11, 31))
    }
  }
  if (preset === 'custom') return null
  return {
    start: toDateString(new Date(year, month, 1)),
    end: toDateString(new Date(year, month + 1, 0))
  }
}

export function formatDate(value) {
  if (!value) return '-'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(new Date(year, month - 1, day))
}

export function rangeLabel(start, end) {
  if (!start || !end) return 'Semua tanggal'
  return start === end ? formatDate(start) : `${formatDate(start)} sampai ${formatDate(end)}`
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short', year: 'numeric'
  }).format(new Date(year, month - 1, 1))
}

export function buildReport({ transactions = [], wallets = [], balances = [], categories = [], members = [] }) {
  const details = transactions.map((t) => ({
    id: t.id,
    date: t.transaction_date,
    title: t.title || '-',
    type: t.type,
    amount: Number(t.amount),
    category: t.categories?.name || 'Tanpa kategori',
    walletId: t.wallet_id,
    wallet: t.wallets?.name || '-',
    memberId: t.created_by,
    member: t.profiles?.full_name || t.profiles?.email || 'Anggota',
    visibility: t.visibility === 'shared' ? 'Bersama' : 'Pribadi',
    note: t.note || ''
  }))

  const summary = details.reduce((acc, item) => {
    acc.count += 1
    if (item.type === 'income') acc.income += item.amount
    else acc.expense += item.amount
    return acc
  }, { income: 0, expense: 0, count: 0 })
  summary.net = summary.income - summary.expense

  const categoryMap = new Map()
  for (const item of details) {
    if (item.type !== 'expense') continue
    const current = categoryMap.get(item.category) ?? { name: item.category, total: 0, count: 0 }
    current.total += item.amount
    current.count += 1
    categoryMap.set(item.category, current)
  }
  const byCategory = [...categoryMap.values()].sort((a, b) => b.total - a.total)

  const monthMap = new Map()
  for (const item of details) {
    const key = item.date.slice(0, 7)
    const current = monthMap.get(key) ?? { key, label: monthLabel(key), income: 0, expense: 0 }
    if (item.type === 'income') current.income += item.amount
    else current.expense += item.amount
    monthMap.set(key, current)
  }
  const byMonth = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => ({ ...m, net: m.income - m.expense }))

  const memberList = members.map((m) => ({
    id: m.user_id,
    name: m.profiles?.full_name || m.profiles?.email || 'Anggota'
  }))
  const memberMap = new Map(memberList.map((m) => [
    m.id, { id: m.id, name: m.name, income: 0, expense: 0, count: 0 }
  ]))
  for (const item of details) {
    const member = item.memberId
    if (!member || !memberMap.has(member)) continue
    const current = memberMap.get(member)
    current.count += 1
    if (item.type === 'income') current.income += item.amount
    else current.expense += item.amount
  }
  const byMember = [...memberMap.values()].sort((a, b) => b.count - a.count)

  const balanceMap = new Map(balances.map((b) => [b.wallet_id, Number(b.balance)]))
  const walletMap = new Map(wallets.map((w) => [w.id, {
    id: w.id,
    name: w.name,
    balance: balanceMap.get(w.id) ?? 0,
    income: 0,
    expense: 0,
    count: 0
  }]))
  for (const item of details) {
    const wallet = item.walletId && walletMap.get(item.walletId)
    if (!wallet) continue
    wallet.count += 1
    if (item.type === 'income') wallet.income += item.amount
    else wallet.expense += item.amount
  }
  const byWallet = [...walletMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    details,
    summary,
    byCategory,
    byMonth,
    byMember,
    byWallet,
    categoryList: categories.map((c) => c.name)
  }
}

export function exportData(type, report) {
  if (type === 'pemasukan' || type === 'pengeluaran') {
    const wanted = type === 'pemasukan' ? 'income' : 'expense'
    return {
      headers: ['Tanggal', 'Judul', 'Kategori', 'Dompet', 'Anggota', 'Visibilitas', 'Jumlah'],
      rows: report.details.filter((item) => item.type === wanted)
        .map((item) => [item.date, item.title, item.category, item.wallet, item.member, item.visibility, item.amount])
    }
  }
  if (type === 'saldo') {
    return {
      headers: ['Dompet', 'Saldo saat ini', 'Pemasukan periode', 'Pengeluaran periode', 'Selisih periode'],
      rows: report.byWallet.map((w) => [w.name, w.balance, w.income, w.expense, w.income - w.expense])
    }
  }
  if (type === 'perbandingan') {
    return {
      headers: ['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih'],
      rows: report.byMonth.map((m) => [m.label, m.income, m.expense, m.net])
    }
  }
  if (type === 'kategori') {
    return {
      headers: ['Kategori', 'Jumlah pengeluaran', 'Jumlah transaksi'],
      rows: report.byCategory.map((c) => [c.name, c.total, c.count])
    }
  }
  if (type === 'anggota') {
    return {
      headers: ['Anggota', 'Jumlah transaksi', 'Pemasukan', 'Pengeluaran'],
      rows: report.byMember.map((m) => [m.name, m.count, m.income, m.expense])
    }
  }
  return {
    headers: ['Dompet', 'Saldo saat ini', 'Pemasukan periode', 'Pengeluaran periode', 'Jumlah transaksi'],
    rows: report.byWallet.map((w) => [w.name, w.balance, w.income, w.expense, w.count])
  }
}

const csvValue = (value) => {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n')
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]))

export function toExcel(headers, rows, title) {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const body = rows.map((row) =>
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  return `<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h3>${escapeHtml(title)}</h3><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
