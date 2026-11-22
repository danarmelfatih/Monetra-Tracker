import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { getBudgetOverview } from '../lib/budget.js'

const ctx = await initPage('/dashboard')

if (ctx) {
  const sb = await getSb()
  const $ = (id) => document.getElementById(id)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const start = monthStart.toISOString().slice(0, 10)

  function showError(message) {
    $('error').textContent = message ? `Gagal memuat data: ${message}. Coba muat ulang halaman.` : ''
    $('btn-retry').hidden = !message
  }

  function renderBudget(result) {
    const detail = $('budget-detail')
    const empty = $('budget-empty')
    if (result.error) {
      $('budget-limit').textContent = '-'
      $('budget-spent').textContent = '-'
      $('budget-remaining').textContent = '-'
      detail.hidden = true
      empty.hidden = false
      empty.textContent = `Budget belum termuat: ${result.error.message || result.error}. Buka halaman Budget untuk mencoba lagi.`
      return
    }

    $('budget-limit').textContent = formatRupiah(result.totals.limit)
    $('budget-spent').textContent = formatRupiah(result.totals.spent)
    $('budget-remaining').textContent = formatRupiah(result.totals.remaining)

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
          el('div', { class: 'budget-title' }, budget.name),
          el('div', { class: 'budget-amount' }, formatRupiah(budget.limit))),
        el('div', { class: 'budget-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) }, fill),
        el('div', { class: 'budget-meta' },
          `${formatRupiah(budget.spent)} terpakai (${budget.percent}%).`))
    })
    if (result.budgets.length > 3) {
      rows.push(el('p', { class: 'muted' }, `Masih ada ${result.budgets.length - 3} budget lainnya.`))
    }
    detail.hidden = false
    empty.hidden = true
    detail.replaceChildren(...rows)
  }

  async function load() {
    showError()
    $('loading').hidden = false
    $('recent').replaceChildren()
    $('recent-empty').hidden = true
    $('empty-action').hidden = true

    const [balanceRes, monthRes, recentRes, budgetResult] = await Promise.all([
      sb.from('wallet_balances').select('balance').eq('family_id', ctx.familyId),
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

    const err = balanceRes.error || monthRes.error || recentRes.error
    if (err) {
      $('total').textContent = '-'
      $('income').textContent = '-'
      $('expense').textContent = '-'
      $('balance-note').textContent = ''
      $('loading').hidden = true
      showError(err.message)
      return
    }

    const balances = balanceRes.data ?? []
    const total = balances.reduce((sum, r) => sum + Number(r.balance), 0)
    $('total').textContent = formatRupiah(total)
    $('balance-note').textContent = `Dari ${balances.length} dompet.`

    let income = 0
    let expense = 0
    for (const t of monthRes.data ?? []) {
      if (t.type === 'income') income += Number(t.amount)
      else expense += Number(t.amount)
    }
    $('income').textContent = formatRupiah(income)
    $('expense').textContent = formatRupiah(expense)

    const rows = recentRes.data ?? []
    $('recent').replaceChildren(...rows.map(row))
    $('recent-empty').hidden = rows.length > 0
    $('empty-action').hidden = rows.length > 0
    $('loading').hidden = true
  }

  function row(t) {
    const wallet = t.wallets?.name ?? '-'
    return el('div', { class: 'cat-row tx-row' },
      el('div', { class: 'tx-main' },
        el('div', { class: 'tx-title' }, t.title),
        el('div', { class: 'muted' }, `${t.transaction_date} · ${wallet}`)),
      el('div', { class: `tx-amount ${t.type}` }, formatRupiah(t.amount)))
  }

  $('btn-retry').addEventListener('click', load)

  await load()
}
