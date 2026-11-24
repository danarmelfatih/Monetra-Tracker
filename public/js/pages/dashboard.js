import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { renderLayout } from '../components/layout.js'
import { shouldUseGuestDashboard } from '../lib/guest.js'
import { el } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { formatRupiah } from '../lib/format.js'
import { getBudgetOverview } from '../lib/budget.js'
import { splitWalletBalances } from '../lib/wallet-summary.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CHART_COLORS = ['#087F5B', '#16A36A', '#086B4D', '#9A621A', '#B93E43', '#5C6B65']

function renderGuestDashboard() {
  const $ = (id) => document.getElementById(id)
  const setText = (id, value) => {
    const node = $(id)
    if (node) node.textContent = value
  }
  const message = (text) => el('p', { class: 'muted' }, text)

  setText('total', '-')
  setText('balance-note', 'Mode tamu, data keuangan tidak ditampilkan. Masuk untuk melihat saldo Anda.')
  setText('savings-count', '')
  setText('savings-total', '-')
  setText('income', '-')
  setText('expense', '-')
  setText('budget-remaining', '-')
  setText('budget-usage', 'Tidak tersedia')
  setText('budget-limit', '-')
  setText('budget-spent', '-')

  const hideButton = $('btn-hide-amounts')
  if (hideButton) hideButton.hidden = true

  $('flow-chart')?.replaceChildren(message('Masuk untuk melihat grafik arus keuangan.'))
  $('category-chart')?.replaceChildren(message('Masuk untuk melihat pengeluaran kategori.'))

  const loading = $('loading')
  if (loading) loading.hidden = true
  const recentEmpty = $('recent-empty')
  if (recentEmpty) {
    recentEmpty.textContent = 'Masuk untuk melihat transaksi terbaru.'
    recentEmpty.hidden = false
  }
  const emptyAction = $('empty-action')
  if (emptyAction) emptyAction.hidden = true
  const budgetEmpty = $('budget-empty')
  if (budgetEmpty) {
    budgetEmpty.textContent = 'Masuk untuk melihat anggaran aktif.'
    budgetEmpty.hidden = false
  }

  document.querySelectorAll('[data-icon]').forEach((node) => {
    node.replaceChildren(icon(node.dataset.icon))
  })
}

const guestMode = shouldUseGuestDashboard({
  search: location.search,
  userAgent: navigator.userAgent,
  width: window.innerWidth
})
const ctx = guestMode ? null : await initPage('/dashboard', { greeting: true })

if (guestMode) {
  await renderLayout({
    user: { id: 'guest', email: '', user_metadata: { full_name: 'Tamu' } },
    familyName: 'Mode Tamu',
    activePath: '/dashboard',
    familyId: null,
    greeting: true,
    guest: true
  })
  renderGuestDashboard()
} else if (ctx) {
  const sb = await getSb()
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const start = monthStart.toISOString().slice(0, 10)

  const svgEl = (tag, attrs = {}, ...children) => {
    const node = document.createElementNS(SVG_NS, tag)
    for (const [key, value] of Object.entries(attrs)) {
      if (value != null) node.setAttribute(key, String(value))
    }
    for (const child of children.flat()) {
      if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)))
    }
    return node
  }

  const num = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const money = (value) => formatRupiah(num(value))

  const label = (value, fallback) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text && !['null', 'undefined', 'nan'].includes(text.toLowerCase()) ? text : fallback
  }

  const compact = (value) => new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(num(value))

  function showError(message) {
    $('error').textContent = message ? `Gagal memuat data: ${message}. Coba muat ulang halaman.` : ''
    $('btn-retry').hidden = !message
  }

  function flowChart(income, expense) {
    const width = 480
    const height = 180
    const left = 52
    const right = 16
    const top = 16
    const bottom = 30
    const max = Math.max(income, expense, 1)
    const xStart = left
    const xEnd = width - right
    const yFor = (value) => height - bottom - (value / max) * (height - top - bottom)
    const point = (value) => `${xEnd},${yFor(value)}`

    return svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Arus keuangan bulan ini. Pemasukan ${money(income)}, pengeluaran ${money(expense)}.`
    },
    svgEl('title', {}, 'Grafik arus keuangan bulan ini'),
    svgEl('line', { class: 'chart-grid', x1: left, y1: top, x2: width - right, y2: top }),
    svgEl('line', { class: 'chart-grid', x1: left, y1: yFor(max / 2), x2: width - right, y2: yFor(max / 2) }),
    svgEl('line', { class: 'chart-grid', x1: left, y1: height - bottom, x2: width - right, y2: height - bottom }),
    svgEl('text', { class: 'chart-label', x: left - 6, y: top + 3, 'text-anchor': 'end' }, `Rp${compact(max)}`),
    svgEl('text', { class: 'chart-label', x: left - 6, y: height - bottom + 3, 'text-anchor': 'end' }, '0'),
    svgEl('text', { class: 'chart-label', x: xStart, y: height - 8, 'text-anchor': 'start' }, 'Awal'),
    svgEl('text', { class: 'chart-label', x: xEnd, y: height - 8, 'text-anchor': 'end' }, 'Hari ini'),
    svgEl('polyline', { class: 'chart-line income', points: `${xStart},${yFor(0)} ${point(income)}` }),
    svgEl('polyline', { class: 'chart-line expense', points: `${xStart},${yFor(0)} ${point(expense)}` }),
    svgEl('circle', { class: 'chart-dot income', cx: xEnd, cy: yFor(income), r: 4 }),
    svgEl('circle', { class: 'chart-dot expense', cx: xEnd, cy: yFor(expense), r: 4 }))
  }

  function categoryChart(budgets) {
    if (!budgets.length) {
      return el('p', { class: 'muted' }, 'Belum ada pengeluaran pada anggaran aktif.')
    }

    const total = budgets.reduce((sum, budget) => sum + Number(budget.spent), 0)
    const base = 42
    const circumference = 2 * Math.PI * base
    let offset = 0
    const segments = budgets.map((budget, index) => {
      const length = total > 0 ? (Number(budget.spent) / total) * circumference : 0
      const segment = svgEl('circle', {
        class: 'donut-segment',
        cx: 60,
        cy: 60,
        r: base,
        stroke: CHART_COLORS[index % CHART_COLORS.length],
        'stroke-dasharray': `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`,
        'stroke-dashoffset': (-offset).toFixed(2),
        transform: 'rotate(-90 60 60)'
      })
      offset += length
      return segment
    })

    const donut = svgEl('svg', {
      viewBox: '0 0 120 120',
      width: 120,
      height: 120,
      role: 'img',
      'aria-label': `Total pengeluaran anggaran ${money(total)}`
    },
    svgEl('title', {}, 'Grafik pengeluaran per kategori anggaran'),
    svgEl('circle', { class: 'donut-track', cx: 60, cy: 60, r: base }),
    ...segments,
    svgEl('text', { class: 'donut-label', x: 60, y: 60 }, `Rp${compact(total)}`),
    svgEl('text', { class: 'donut-sub', x: 60, y: 75 }, 'terpakai'))

    const legend = el('div', { class: 'category-legend' }, ...budgets.map((budget, index) =>
      el('div', { class: 'category-legend-row' },
        el('i', { class: 'legend-dot', style: `background:${CHART_COLORS[index % CHART_COLORS.length]}` }),
        el('span', {}, label(budget.name, 'Anggaran')),
        el('strong', {}, money(budget.spent)))))

    return el('div', { class: 'category-chart' }, donut, legend)
  }

  function chartBudgets(budgets) {
    const active = budgets
      .filter((budget) => Number(budget.spent) > 0)
      .sort((a, b) => Number(b.spent) - Number(a.spent))
    if (active.length <= 5) return active
    const rest = active.slice(4).reduce((sum, budget) => sum + Number(budget.spent), 0)
    return [...active.slice(0, 4), { name: 'Lainnya', spent: rest }]
  }

  function renderBudget(result) {
    const detail = $('budget-detail')
    const empty = $('budget-empty')
    const usage = $('budget-usage')

    if (result.error) {
      $('budget-limit').textContent = '-'
      $('budget-spent').textContent = '-'
      $('budget-remaining').textContent = '-'
      usage.textContent = '-'
      detail.hidden = true
      empty.hidden = false
      empty.textContent = `Budget belum termuat: ${result.error.message || result.error}. Buka halaman Budget untuk mencoba lagi.`
      $('category-chart').replaceChildren(el('p', { class: 'muted' }, 'Grafik kategori tidak tersedia.'))
      return
    }

    $('budget-limit').textContent = money(result.totals.limit)
    $('budget-spent').textContent = money(result.totals.spent)
    $('budget-remaining').textContent = money(result.totals.remaining)
    usage.textContent = result.totals.limit > 0
      ? `${Math.round((result.totals.spent / result.totals.limit) * 100)}%`
      : '0%'

    $('category-chart').replaceChildren(categoryChart(chartBudgets(result.budgets || [])))

    if (!result.budgets.length) {
      detail.hidden = true
      empty.hidden = false
      empty.textContent = 'Belum ada budget aktif. Buat batas pengeluaran di halaman Budget.'
      return
    }

    const rows = result.budgets.slice(0, 3).map((budget) => {
      const percent = Math.min(100, Math.max(0, budget.percent))
      const fill = el('div', { class: `budget-fill ${budget.status}` })
      fill.style.width = `${percent}%`
      return el('div', { class: 'budget-item' },
        el('div', { class: 'budget-head' },
          el('div', { class: 'budget-title' }, label(budget.name, 'Anggaran')),
          el('div', { class: 'budget-amount' }, money(budget.limit))),
        el('div', { class: 'budget-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) }, fill),
        el('div', { class: 'budget-meta' },
          `${money(budget.spent)} terpakai (${budget.percent}%).`),
        el('div', { class: 'budget-item-foot' },
          el('span', { class: `budget-status ${budget.status}` }, budget.status === 'danger' ? 'Terlampaui' : budget.status === 'warn' ? 'Hampir habis' : 'Aman'),
          el('span', { class: 'budget-meta' }, `Sisa ${money(Math.max(0, budget.limit - budget.spent))}`)))
    })
    if (result.budgets.length > 3) {
      rows.push(el('p', { class: 'muted' }, `Masih ada ${result.budgets.length - 3} budget lainnya.`))
    }
    detail.hidden = false
    empty.hidden = true
    detail.replaceChildren(...rows)
  }

  function tableRow(t) {
    const wallet = label(t.wallets?.name, '-')
    return el('tr', {},
      el('td', { class: 'tx-main-name' }, label(t.title, 'Transaksi')),
      el('td', { class: 'muted' }, t.transaction_date),
      el('td', { class: 'muted' }, wallet),
      el('td', { class: `num tx-amount ${t.type}` }, money(t.amount)))
  }

  function row(t) {
    const wallet = label(t.wallets?.name, '-')
    return el('div', { class: 'cat-row mobile-tx-row' },
      el('span', { class: `tx-icon ${t.type}` }, icon(t.type === 'income' ? 'income' : 'expense')),
      el('div', { class: 'tx-main' },
        el('div', { class: 'tx-title' }, label(t.title, 'Transaksi')),
        el('div', { class: 'muted' }, `${t.transaction_date} · ${wallet}`)),
      el('div', { class: `tx-amount ${t.type} mobile-tx-amount` }, money(t.amount)))
  }

  async function load() {
    showError()
    $('loading').hidden = false
    $('recent').replaceChildren()
    $('recent-table').replaceChildren()
    $('recent-empty').textContent = 'Belum ada transaksi tercatat.'
    $('recent-empty').hidden = true
    $('empty-action').hidden = true

    const [balanceRes, walletRes, monthRes, recentRes, budgetResult] = await Promise.all([
      sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', ctx.familyId),
      sb.from('wallets').select('id, type').eq('family_id', ctx.familyId),
      sb.from('transactions')
        .select('amount, type')
        .eq('family_id', ctx.familyId)
        .is('deleted_at', null)
        .gte('transaction_date', start),
      sb.from('transactions')
        .select('id, title, amount, type, transaction_date, wallets(name)')
        .eq('family_id', ctx.familyId)
        .is('deleted_at', null)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),
      getBudgetOverview(sb, ctx.familyId, ctx.user.id).catch((e) => ({ error: e }))
    ])
    renderBudget(budgetResult)

    const err = balanceRes.error || walletRes.error || monthRes.error || recentRes.error
    if (err) {
      $('total').textContent = '-'
      $('income').textContent = '-'
      $('expense').textContent = '-'
      $('balance-note').textContent = ''
      $('savings-count').textContent = ''
      $('savings-total').textContent = '-'
      $('flow-chart').replaceChildren(el('p', { class: 'muted' }, 'Grafik tidak dapat dimuat.'))
      $('loading').hidden = true
      $('recent-empty').textContent = 'Data transaksi tidak dapat dimuat.'
      $('recent-empty').hidden = false
      showError(err.message)
      return
    }

    const wallets = walletRes.data ?? []
    const summary = splitWalletBalances(wallets, balanceRes.data ?? [])
    $('total').textContent = money(summary.saldoTotal)
    $('balance-note').textContent = `Dari ${summary.saldoCount} dompet siap pakai.`
    $('savings-count').textContent = `${summary.savingsCount} tabungan`
    $('savings-total').textContent = money(summary.savingsTotal)

    let income = 0
    let expense = 0
    for (const t of monthRes.data ?? []) {
      if (t.type === 'income') income += Number(t.amount)
      else expense += Number(t.amount)
    }
    $('income').textContent = money(income)
    $('expense').textContent = money(expense)
    $('flow-chart').replaceChildren(flowChart(income, expense))

    const rows = recentRes.data ?? []
    $('recent').replaceChildren(...rows.map(row))
    $('recent-table').replaceChildren(...rows.map(tableRow))
    $('recent-empty').hidden = rows.length > 0
    $('empty-action').hidden = rows.length > 0
    $('loading').hidden = true
  }

  document.querySelectorAll('[data-icon]').forEach((node) => {
    node.replaceChildren(icon(node.dataset.icon))
  })

  $('btn-retry').addEventListener('click', load)

  await load()
}
