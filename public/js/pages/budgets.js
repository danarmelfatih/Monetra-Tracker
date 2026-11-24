import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { getBudgetOverview } from '../lib/budget.js'
import { guestAvailable, getGuestBudgetOverview, saveGuestBudget, archiveGuestBudget } from '../lib/guest-store.js'

const ctx = await initPage('/budgets')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  const form = $('budget-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { user, familyId } = ctx
  let overview = null

  const setError = (message = '') => { $('error').textContent = message }
  const setStatus = (message = '') => { $('status').textContent = message }
  const setLoading = (loading) => { $('loading').hidden = !loading }

  function fillOptions(data) {
    const categoryValue = $('budget-category').value
    const memberValue = $('budget-member').value
    const expenseCategories = data.categories.filter((c) => !c.is_archived && c.type === 'expense')
    const categoryOptions = [
      el('option', { value: '' }, 'Semua kategori'),
      ...expenseCategories.map((c) => el('option', { value: c.id }, c.name))
    ]
    const memberOptions = [
      el('option', { value: '' }, guest ? 'Tamu' : 'Seluruh anggota'),
      ...data.members.map((m) => el('option', { value: m.user_id },
        m.profiles?.full_name || m.profiles?.email || 'Anggota'))
    ]
    $('budget-category').replaceChildren(...categoryOptions)
    $('budget-member').replaceChildren(...memberOptions)
    if (categoryOptions.some((option) => option.getAttribute('value') === categoryValue)) {
      $('budget-category').value = categoryValue
    }
    if (memberOptions.some((option) => option.getAttribute('value') === memberValue)) {
      $('budget-member').value = memberValue
    }
  }

  function applyPermissions(canManage) {
    form.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !canManage
    })
    $('form-note').textContent = guest
      ? 'Mode tamu: anggaran disimpan lokal di perangkat ini.'
      : canManage
        ? 'Budget berlaku untuk bulan berjalan dan memakai transaksi pengeluaran yang tercatat.'
        : 'Hanya admin keluarga yang bisa menambah atau mengubah budget.'
  }

  function renderSummary(totals) {
    $('budget-limit-total').textContent = formatRupiah(totals.limit)
    $('budget-spent-total').textContent = formatRupiah(totals.spent)
    $('budget-remaining-total').textContent = formatRupiah(totals.remaining)
  }

  function renderRow(budget, canManage) {
    const statusText = {
      safe: 'Aman',
      warn: 'Mendekati batas',
      danger: 'Melebihi batas'
    }[budget.status]
    const percent = Math.min(100, Math.max(0, budget.percent))
    const fill = el('div', { class: `budget-fill ${budget.status}` })
    fill.style.width = `${percent}%`
    const track = el('div', {
      class: 'budget-track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(percent),
      'aria-label': `Penggunaan budget ${budget.name}`
    }, fill)
    const remainingText = budget.remaining >= 0
      ? `Sisa ${formatRupiah(budget.remaining)}`
      : `Lebih ${formatRupiah(Math.abs(budget.remaining))}`

    return el('div', { class: 'budget-item' },
      el('div', { class: 'budget-head' },
        el('div', {},
          el('div', { class: 'budget-title' }, budget.name),
          el('div', { class: 'budget-meta' }, `${budget.categoryName} · ${budget.memberName}`)),
        el('div', { class: 'budget-amount' }, formatRupiah(budget.limit))),
      track,
      el('div', { class: 'budget-meta' },
        `Terpakai ${formatRupiah(budget.spent)} dari ${formatRupiah(budget.limit)} (${budget.percent}%). ${remainingText}.`),
      el('div', { class: 'budget-item-foot' },
        el('span', { class: `budget-status ${budget.status}` }, statusText),
        canManage ? el('button', {
          class: 'btn-link',
          onclick: () => archive(budget)
        }, 'Arsipkan') : null))
  }

  function renderList(rows, canManage) {
    if (!rows.length) {
      $('budget-list').replaceChildren(el('div', { class: 'panel empty-state' },
        'Belum ada budget aktif. Pilih kategori atau anggota, lalu simpan batas bulan ini.'))
      return
    }
    $('budget-list').replaceChildren(...rows.map((budget) => renderRow(budget, canManage)))
  }

  async function load() {
    setError()
    setStatus()
    setLoading(true)
    try {
      if (guest) {
        const ok = await guestAvailable()
        if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
        overview = await getGuestBudgetOverview()
      } else {
        overview = await getBudgetOverview(sb, familyId, user.id)
      }
      fillOptions(overview)
      applyPermissions(overview.canManage)
      renderSummary(overview.totals)
      renderList(overview.budgets, overview.canManage)
    } catch (e) {
      overview = null
      renderSummary({ limit: 0, spent: 0, remaining: 0 })
      renderList([], false)
      setError(e.message || 'Gagal memuat budget. Coba muat ulang halaman.')
    } finally {
      setLoading(false)
    }
  }

  async function archive(budget) {
    if (!overview?.canManage) return
    if (!confirm(`Arsipkan budget "${budget.name}"?`)) return
    try {
      if (guest) await archiveGuestBudget(budget.id)
      else {
        const { error } = await sb.from('budgets').update({ is_archived: true }).eq('id', budget.id)
        if (error) throw error
      }
      await load()
      setStatus('Budget diarsipkan.')
    } catch (e) {
      setError(e.message)
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!overview?.canManage) return
    setError()
    setStatus()

    const categoryId = $('budget-category').value || null
    const memberId = $('budget-member').value || null
    const amountLimit = Number($('budget-limit').value)
    const alertThreshold = Number($('budget-alert').value) || 80
    const category = overview.categories.find((c) => c.id === categoryId)
    const member = overview.members.find((m) => m.user_id === memberId)
    const memberLabel = member
      ? ` · ${member.profiles?.full_name || member.profiles?.email || 'Anggota'}`
      : ''
    const name = `${category?.name ?? 'Semua kategori'}${memberLabel} · ${overview.range.label}`

    try {
      if (guest) {
        await saveGuestBudget({
          name,
          category_id: categoryId,
          member_id: memberId,
          amount_limit: amountLimit,
          alert_threshold: alertThreshold,
          start_date: overview.range.start,
          end_date: overview.range.end
        })
      } else {
        let query = sb.from('budgets').select('id')
          .eq('family_id', familyId)
          .eq('period_type', 'monthly')
          .eq('start_date', overview.range.start)
          .eq('end_date', overview.range.end)
          .eq('is_archived', false)
        if (categoryId) query = query.eq('category_id', categoryId)
        else query = query.is('category_id', null)
        if (memberId) query = query.eq('member_id', memberId)
        else query = query.is('member_id', null)

        const find = await query.limit(1)
        if (find.error) throw find.error

        const payload = {
          name,
          amount_limit: amountLimit,
          alert_threshold: alertThreshold,
          is_archived: false
        }
        const existing = find.data?.[0]
        const result = existing
          ? await sb.from('budgets').update(payload).eq('id', existing.id)
          : await sb.from('budgets').insert({
            ...payload,
            family_id: familyId,
            category_id: categoryId,
            member_id: memberId,
            period_type: 'monthly',
            start_date: overview.range.start,
            end_date: overview.range.end,
            created_by: user.id
          })
        if (result.error) throw result.error
      }

      form.reset()
      $('budget-alert').value = '80'
      await load()
      setStatus('Budget tersimpan.')
    } catch (err) {
      setError(err.message)
    }
  })

  $('budget-alert').value = '80'
  await load()
}