import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { formatRupiah } from '../lib/format.js'
import { getBudgetOverview } from '../lib/budget.js'
import { summarizeFamilyBalances } from '../lib/wallet-summary.js'
import { initPrivacyToggle } from '../components/privacy-toggle.js'
import { guestAvailable, getGuestBudgetOverview, buildGuestReportData } from '../lib/guest-store.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

function flowChart(income, expense) {
  const width = 640
  const height = 220
  const pad = { top: 16, right: 16, bottom: 30, left: 16 }
  const max = Math.max(income, expense, 1)
  const x = (index) => pad.left + (index * (width - pad.left - pad.right))
  const y = (value) => height - pad.bottom - ((value / max) * (height - pad.top - pad.bottom))
  const points = [
    [x(0), y(0)],
    [x(0.35), y(income * 0.55)],
    [x(0.7), y(income * 0.9)],
    [x(1), y(income)]
  ]
  const expensePoints = [
    [x(0), y(0)],
    [x(0.35), y(expense * 0.45)],
    [x(0.7), y(expense * 0.82)],
    [x(1), y(expense)]
  ]
  const toPath = (pts) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const toArea = (pts) => `${toPath(pts)} L${pts[pts.length - 1][0].toFixed(1)} ${(height - pad.bottom).toFixed(1)} L${pts[0][0].toFixed(1)} ${(height - pad.bottom).toFixed(1)} Z`
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('class', 'flow-svg')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `Grafik pemasukan ${formatRupiah(income)} dan pengeluaran ${formatRupiah(expense)}`)

  for (let i = 0; i < 4; i += 1) {
    const gy = pad.top + (i * ((height - pad.top - pad.bottom) / 3))
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(pad.left))
    line.setAttribute('x2', String(width - pad.right))
    line.setAttribute('y1', String(gy))
    line.setAttribute('y2', String(gy))
    line.setAttribute('class', 'flow-grid')
    svg.append(line)
  }

  const defs = document.createElementNS(SVG_NS, 'defs')
  const incomeGrad = document.createElementNS(SVG_NS, 'linearGradient')
  incomeGrad.setAttribute('id', 'flow-income-grad')
  incomeGrad.setAttribute('x1', '0')
  incomeGrad.setAttribute('x2', '0')
  incomeGrad.setAttribute('y1', '0')
  incomeGrad.setAttribute('y2', '1')
  incomeGrad.innerHTML = '<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.22"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>'
  defs.append(incomeGrad)
  svg.append(defs)

  const incomeArea = document.createElementNS(SVG_NS, 'path')
  incomeArea.setAttribute('d', toArea(points))
  incomeArea.setAttribute('fill', 'url(#flow-income-grad)')
  svg.append(incomeArea)

  const expensePath = document.createElementNS(SVG_NS, 'path')
  expensePath.setAttribute('d', toPath(expensePoints))
  expensePath.setAttribute('class', 'flow-line expense')
  svg.append(expensePath)

  const incomePath = document.createElementNS(SVG_NS, 'path')
  incomePath.setAttribute('d', toPath(points))
  incomePath.setAttribute('class', 'flow-line income')
  svg.append(incomePath)

  ;[
    [points[points.length - 1], 'income'],
    [expensePoints[expensePoints.length - 1], 'expense']
  ].forEach(([[cx, cy], kind]) => {
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(cx))
    dot.setAttribute('cy', String(cy))
    dot.setAttribute('r', '5')
    dot.setAttribute('class', `flow-dot ${kind}`)
    svg.append(dot)
  })

  return svg
}

function emptyChart(text) {
  return el('p', { class: 'muted' }, text)
}

function renderBudget(budgets) {
  const list = document.getElementById('budget-detail') || document.getElementById('budget-list')
  const empty = document.getElementById('budget-empty')
  if (!list) return
  list.replaceChildren()
  if (!budgets.length) {
    list.hidden = true
    if (empty) {
      empty.textContent = 'Belum ada budget aktif.'
      empty.hidden = false
    }
    return
  }
  list.hidden = false
  if (empty) empty.hidden = true
  budgets.slice(0, 3).forEach((b) => {
    const percent = Math.min(100, Math.max(0, b.percent))
    const fill = el('div', { class: `budget-fill ${b.status}` })
    fill.style.width = `${percent}%`
    list.append(el('div', { class: 'budget-item' },
      el('div', { class: 'budget-head' },
        el('div', { class: 'budget-title' }, b.name),
        el('div', { class: 'budget-amount' }, formatRupiah(b.limit))),
      el('div', { class: 'budget-track' }, fill),
      el('div', { class: 'budget-meta' },
        `Terpakai ${formatRupiah(b.spent)} · ${percent}%`)))
  })
}

async function loadFamilySummary(sb, familyId) {
  const walletRes = await sb.from('wallets')
    .select('id, name, type, scope, initial_balance, is_archived')
    .eq('family_id', familyId)
    .eq('is_archived', false)

  if (walletRes.error) throw walletRes.error
  const wallets = walletRes.data ?? []
  const main = wallets.find((w) => w.scope === 'family_main')
  const savings = wallets.find((w) => w.scope === 'family_savings')

  let balances = []
  if (main || savings) {
    const [mainRes, savingsRes] = await Promise.all([
      main ? sb.from('family_main_balances').select('wallet_id, balance').eq('wallet_id', main.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      savings ? sb.from('family_savings_balances').select('wallet_id, balance').eq('wallet_id', savings.id).maybeSingle() : Promise.resolve({ data: null, error: null })
    ])
    if (mainRes.error || savingsRes.error) throw mainRes.error || savingsRes.error
    if (mainRes.data) balances.push(mainRes.data)
    if (savingsRes.data) balances.push(savingsRes.data)
  } else {
    const legacyRes = await sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
    if (legacyRes.error) throw legacyRes.error
    balances = legacyRes.data ?? []
  }

  return { wallets, balances }
}

const ctx = await initPage('/dashboard', { greeting: true })

if (ctx) {
  const $ = (id) => document.getElementById(id)
  initPrivacyToggle()

  async function load() {
    $('loading').hidden = false
    $('error').hidden = true
    $('empty-action').hidden = true

    try {
      let wallets = []
      let balances = []
      let txMonth = []
      let recent = []
      let budgetOverview = { budgets: [], totals: { limit: 0, spent: 0, remaining: 0 } }

      if (ctx.guest) {
        const ok = await guestAvailable()
        if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
        const data = await buildGuestReportData()
        wallets = data.wallets.filter((w) => !w.is_archived)
        balances = data.balances
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        txMonth = data.transactions.filter((t) => t.transaction_date >= monthStart)
        recent = data.transactions.slice(0, 5)
        budgetOverview = await getGuestBudgetOverview()
      } else {
        const sb = await getSb()
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const monthIso = monthStart.toISOString().slice(0, 10)

        const [summaryRes, txRes, recentRes, budgetRes] = await Promise.all([
          loadFamilySummary(sb, ctx.familyId),
          sb.from('transactions').select('amount, type').eq('family_id', ctx.familyId).is('deleted_at', null).gte('transaction_date', monthIso),
          sb.from('transactions')
            .select('id, title, amount, type, transaction_date, wallets(name, type, scope)')
            .eq('family_id', ctx.familyId).is('deleted_at', null)
            .order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
          getBudgetOverview(sb, ctx.familyId, ctx.user.id).catch(() => ({ budgets: [], totals: { limit: 0, spent: 0, remaining: 0 } }))
        ])
        const err = txRes.error || recentRes.error
        if (err) throw err
        wallets = summaryRes.wallets
        balances = summaryRes.balances
        txMonth = txRes.data ?? []
        recent = recentRes.data ?? []
        budgetOverview = budgetRes
      }

      const summary = summarizeFamilyBalances(wallets, balances)
      $('total').textContent = formatRupiah(summary.mainBalance)
      $('balance-note').textContent = ctx.guest
        ? 'Mode tamu: Dompet Utama dan Tabungan Keluarga disimpan lokal di perangkat ini.'
        : summary.main
          ? 'Saldo Dompet Utama Keluarga. Tabungan keluarga ditampilkan terpisah.'
          : 'Data dompet keluarga belum tersedia.'
      $('savings-count').textContent = summary.savings ? '1' : '0'
      $('savings-total').textContent = formatRupiah(summary.savingsBalance)

      let income = 0
      let expense = 0
      for (const tx of txMonth) {
        if (tx.type === 'income') income += Number(tx.amount)
        else expense += Number(tx.amount)
      }
      $('income').textContent = formatRupiah(income)
      $('expense').textContent = formatRupiah(expense)
      const flowChartNode = $('flow-chart')
      if (flowChartNode) flowChartNode.replaceChildren(flowChart(income, expense))

      const budgets = budgetOverview.budgets ?? []
      const totalLimit = budgetOverview.totals?.limit ?? 0
      const totalSpent = budgetOverview.totals?.spent ?? 0
      $('budget-remaining').textContent = formatRupiah(totalLimit - totalSpent)
      $('budget-usage').textContent = totalLimit > 0 ? `${Math.round((totalSpent / totalLimit) * 100)}% terpakai` : 'Belum ada budget'
      $('budget-limit').textContent = formatRupiah(totalLimit)
      $('budget-spent').textContent = formatRupiah(totalSpent)
      renderBudget(budgets)
      const categoryChart = $('category-chart')
      if (categoryChart) categoryChart.replaceChildren(budgets.length ? emptyChart('Ringkasan kategori tersedia di halaman Anggaran.') : emptyChart(ctx.guest ? 'Buat anggaran untuk melihat ringkasan.' : 'Belum ada budget aktif.'))

      const row = (t) => el('div', { class: 'tx-row' },
        el('div', { class: 'tx-main' },
          el('div', { class: 'tx-title' }, t.title),
          el('div', { class: 'muted' }, `${t.transaction_date} · ${t.wallets?.name ?? '-'}`)),
        el('div', { class: `tx-amount ${t.type}` }, `${t.type === 'income' ? '+' : '-'}${formatRupiah(t.amount)}`))

      const tableRow = (t) => el('tr', {},
        el('td', {}, t.title),
        el('td', {}, t.wallets?.name ?? '-'),
        el('td', {}, t.transaction_date),
        el('td', { class: `tx-amount ${t.type}` }, `${t.type === 'income' ? '+' : '-'}${formatRupiah(t.amount)}`))

      const recentList = $('recent')
      const recentTable = $('recent-table')
      if (recentList) recentList.replaceChildren(...recent.map(row))
      if (recentTable) recentTable.replaceChildren(...recent.map(tableRow))
      $('recent-empty').hidden = recent.length > 0
      $('empty-action').hidden = recent.length > 0
      $('loading').hidden = true
    } catch (e) {
      $('loading').hidden = true
      $('error').textContent = e.message || 'Gagal memuat dashboard.'
      $('error').hidden = false
      $('empty-action').hidden = false
    }
  }

  document.querySelectorAll('[data-icon]').forEach((node) => {
    node.replaceChildren(icon(node.dataset.icon))
  })

  $('btn-retry').addEventListener('click', load)
  await load()
}
