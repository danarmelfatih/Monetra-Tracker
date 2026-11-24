import { getSb } from '../lib/supabase.js'
import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import { formatRupiah } from '../lib/format.js'
import { walletKindLabel } from '../lib/wallet-summary.js'
import {
  REPORT_TYPES,
  rangeForPreset,
  rangeLabel,
  buildReport,
  exportData,
  toCsv,
  toExcel,
  downloadFile
} from '../lib/report.js'
import { guestAvailable, buildGuestReportData } from '../lib/guest-store.js'

const ctx = await initPage('/reports')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { familyId } = ctx
  let refs = { categories: [], members: [], wallets: [] }
  let current = null
  let currentType = 'pemasukan'
  let currentRange = null

  const setError = (message = '') => { $('error').textContent = message }
  const setLoading = (loading) => { $('loading').hidden = !loading }
  const setExportEnabled = (enabled) => {
    $('btn-csv').disabled = !enabled
    $('btn-excel').disabled = !enabled
    $('btn-pdf').disabled = !enabled
  }

  function fillSelect(select, items, allLabel, valueKey, labelFn) {
    const selected = select.value
    const options = [
      el('option', { value: '' }, allLabel),
      ...items.map((item) => el('option', { value: item[valueKey] }, labelFn(item)))
    ]
    select.replaceChildren(...options)
    if (options.some((option) => option.getAttribute('value') === selected)) {
      select.value = selected
    }
  }

  function syncPreset() {
    const preset = $('report-preset').value
    const range = rangeForPreset(preset)
    if (range) {
      $('date-start').value = range.start
      $('date-end').value = range.end
      $('date-start').disabled = true
      $('date-end').disabled = true
    } else {
      $('date-start').disabled = false
      $('date-end').disabled = false
      const fallback = rangeForPreset('bulanan')
      if (!$('date-start').value) $('date-start').value = fallback.start
      if (!$('date-end').value) $('date-end').value = fallback.end
    }
  }

  async function loadRefs() {
    if (guest) {
      const ok = await guestAvailable()
      if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
      const data = await buildGuestReportData()
      refs = {
        categories: data.categories.filter((c) => !c.is_archived),
        members: data.members,
        wallets: data.wallets
      }
    } else {
      const [categoryRes, memberRes, walletRes] = await Promise.all([
        sb.from('categories').select('id, name').eq('family_id', familyId).order('name'),
        sb.from('family_members')
          .select('user_id, profiles(full_name, email)')
          .eq('family_id', familyId)
          .eq('status', 'active'),
        sb.from('wallets').select('id, name, type').eq('family_id', familyId).order('name')
      ])
      const err = categoryRes.error || memberRes.error || walletRes.error
      if (err) throw err
      refs = {
        categories: categoryRes.data ?? [],
        members: memberRes.data ?? [],
        wallets: walletRes.data ?? []
      }
    }
    fillSelect($('filter-category'), refs.categories, 'Semua kategori', 'id', (c) => c.name)
    fillSelect($('filter-member'), refs.members, guest ? 'Tamu' : 'Semua anggota', 'user_id',
      (m) => m.profiles?.full_name || m.profiles?.email || 'Anggota')
    fillSelect($('filter-wallet'), refs.wallets, 'Semua dompet', 'id',
      (w) => walletKindLabel(w.type) === 'Tabungan' ? `${w.name} (Tabungan)` : w.name)
  }

  function table(headers, rows, numericColumns = []) {
    if (!rows.length) return el('p', { class: 'muted' }, 'Tidak ada data pada filter ini.')
    return el('div', { class: 'report-table-wrap' },
      el('table', { class: 'report-table' },
        el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', {}, h)))),
        el('tbody', {}, ...rows.map((row) =>
          el('tr', {}, ...row.map((cell, index) =>
            el('td', { class: numericColumns.includes(index) ? 'num' : '' }, cell)))))))
  }

  function renderSummary(report) {
    $('report-summary').replaceChildren(
      el('div', { class: 'summary-item' },
        el('div', { class: 'label' }, 'Pemasukan'),
        el('div', { class: 'value income' }, formatRupiah(report.summary.income))),
      el('div', { class: 'summary-item' },
        el('div', { class: 'label' }, 'Pengeluaran'),
        el('div', { class: 'value expense' }, formatRupiah(report.summary.expense))),
      el('div', { class: 'summary-item' },
        el('div', { class: 'label' }, 'Selisih'),
        el('div', { class: 'value' }, formatRupiah(report.summary.net))),
      el('div', { class: 'summary-item' },
        el('div', { class: 'label' }, 'Jumlah transaksi'),
        el('div', { class: 'value' }, String(report.summary.count)))
    )
  }

  function detailRows(type) {
    return current.details
      .filter((item) => item.type === type)
      .map((item) => [
        item.date,
        item.title,
        item.category,
        item.wallet,
        item.member,
        item.visibility,
        formatRupiah(item.amount)
      ])
  }

  function render() {
    if (!current) return
    currentType = $('report-type').value
    const label = REPORT_TYPES.find((item) => item.id === currentType)?.label ?? 'Laporan'
    const period = rangeLabel(currentRange.start, currentRange.end)
    $('report-title').textContent = label
    $('report-range').textContent = period
    $('print-title').textContent = `${label} · ${period}`
    renderSummary(current)

    const content = $('report-content')
    if (currentType === 'pemasukan' || currentType === 'pengeluaran') {
      const type = currentType === 'pemasukan' ? 'income' : 'expense'
      content.replaceChildren(table(
        ['Tanggal', 'Judul', 'Kategori', 'Dompet', 'Anggota', 'Visibilitas', 'Jumlah'],
        detailRows(type),
        [6]
      ))
      return
    }

    if (currentType === 'saldo' || currentType === 'dompet') {
      const rows = current.byWallet.map((wallet) => [
        wallet.kind,
        wallet.name,
        formatRupiah(wallet.balance),
        formatRupiah(wallet.income),
        formatRupiah(wallet.expense),
        currentType === 'saldo'
          ? formatRupiah(wallet.income - wallet.expense)
          : String(wallet.count)
      ])
      content.replaceChildren(table(
        ['Jenis', 'Dompet', 'Saldo saat ini', 'Pemasukan periode', 'Pengeluaran periode',
          currentType === 'saldo' ? 'Selisih periode' : 'Jumlah transaksi'],
        rows,
        [2, 3, 4, 5]
      ))
      return
    }

    if (currentType === 'perbandingan') {
      content.replaceChildren(table(
        ['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih'],
        current.byMonth.map((m) => [m.label, formatRupiah(m.income), formatRupiah(m.expense), formatRupiah(m.net)]),
        [1, 2, 3]
      ))
      return
    }

    if (currentType === 'kategori') {
      content.replaceChildren(table(
        ['Kategori', 'Jumlah pengeluaran', 'Jumlah transaksi'],
        current.byCategory.map((c) => [c.name, formatRupiah(c.total), String(c.count)]),
        [1, 2]
      ))
      return
    }

    content.replaceChildren(table(
      ['Anggota', 'Jumlah transaksi', 'Pemasukan', 'Pengeluaran'],
      current.byMember.map((m) => [m.name, String(m.count), formatRupiah(m.income), formatRupiah(m.expense)]),
      [1, 2, 3]
    ))
  }

  async function loadReport() {
    setError()
    setLoading(true)
    setExportEnabled(false)

    const start = $('date-start').value
    const end = $('date-end').value
    if (!start || !end || start > end) {
      setLoading(false)
      setError('Tentukan rentang tanggal yang valid, mulai tidak boleh setelah sampai.')
      return
    }

    try {
      if (guest) {
        const ok = await guestAvailable()
        if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
        const data = await buildGuestReportData({
          from: start,
          to: end,
          categoryId: $('filter-category').value,
          walletId: $('filter-wallet').value,
          memberId: $('filter-member').value
        })
        currentRange = { start, end }
        current = buildReport({
          transactions: data.transactions,
          wallets: data.wallets,
          balances: data.balances,
          categories: data.categories,
          members: data.members
        })
      } else {
        let query = sb.from('transactions')
          .select('id, title, amount, type, transaction_date, note, visibility, category_id, wallet_id, created_by, categories(name), wallets(name), profiles(full_name, email)')
          .eq('family_id', familyId)
          .is('deleted_at', null)
          .gte('transaction_date', start)
          .lte('transaction_date', end)
          .order('transaction_date', { ascending: false })
          .limit(1000)
        if ($('filter-category').value) query = query.eq('category_id', $('filter-category').value)
        if ($('filter-member').value) query = query.eq('created_by', $('filter-member').value)
        if ($('filter-wallet').value) query = query.eq('wallet_id', $('filter-wallet').value)

        const [txRes, walletRes, balanceRes] = await Promise.all([
          query,
          sb.from('wallets').select('id, name, type').eq('family_id', familyId).order('name'),
          sb.from('wallet_balances').select('wallet_id, balance').eq('family_id', familyId)
        ])
        const err = txRes.error || walletRes.error || balanceRes.error
        if (err) throw err

        currentRange = { start, end }
        current = buildReport({
          transactions: txRes.data ?? [],
          wallets: walletRes.data ?? [],
          balances: balanceRes.data ?? [],
          categories: refs.categories,
          members: refs.members
        })
      }
      render()
      setExportEnabled(true)
      $('filter-note').textContent = guest
        ? 'Mode tamu: laporan dihitung dari data lokal di perangkat ini.'
        : 'Laporan mengikuti aturan visibilitas transaksi akun ini. Menampilkan maksimal 1000 transaksi terakhir pada rentang ini.'
    } catch (e) {
      current = null
      $('report-summary').replaceChildren()
      $('report-content').replaceChildren(el('p', { class: 'muted' }, 'Laporan gagal dimuat. Perbaiki koneksi atau filter lalu coba lagi.'))
      setError(e.message || 'Gagal memuat laporan.')
    } finally {
      setLoading(false)
    }
  }

  function exportDataForCurrent() {
    if (!current) {
      setError('Tampilkan laporan terlebih dahulu sebelum mengekspor.')
      return null
    }
    const data = exportData(currentType, current)
    if (!data.rows.length) {
      setError('Tidak ada baris yang bisa diekspor pada laporan ini.')
      return null
    }
    setError()
    return data
  }

  $('report-type').replaceChildren(...REPORT_TYPES.map((item) =>
    el('option', { value: item.id }, item.label)))
  $('report-preset').addEventListener('change', syncPreset)
  $('filter-form').addEventListener('submit', (e) => {
    e.preventDefault()
    loadReport()
  })
  $('report-type').addEventListener('change', () => {
    if (current) render()
  })
  $('btn-reset').addEventListener('click', () => {
    $('report-type').value = 'pemasukan'
    $('report-preset').value = 'bulanan'
    $('filter-category').value = ''
    $('filter-member').value = ''
    $('filter-wallet').value = ''
    syncPreset()
    loadReport()
  })
  $('btn-csv').addEventListener('click', () => {
    const data = exportDataForCurrent()
    if (!data) return
    const filename = `laporan-${currentType}-${currentRange.start}-${currentRange.end}.csv`
    downloadFile(filename, `\uFEFF${toCsv(data.headers, data.rows)}`, 'text/csv;charset=utf-8')
  })
  $('btn-excel').addEventListener('click', () => {
    const data = exportDataForCurrent()
    if (!data) return
    const title = `${REPORT_TYPES.find((item) => item.id === currentType)?.label ?? 'Laporan'} ${rangeLabel(currentRange.start, currentRange.end)}`
    const filename = `laporan-${currentType}-${currentRange.start}-${currentRange.end}.xls`
    downloadFile(filename, `\uFEFF${toExcel(data.headers, data.rows, title)}`, 'application/vnd.ms-excel;charset=utf-8')
  })
  $('btn-pdf').addEventListener('click', () => {
    if (current) window.print()
  })

  try {
    await loadRefs()
    syncPreset()
    await loadReport()
  } catch (e) {
    setError(e.message || 'Gagal memuat data pendukung laporan.')
  }
}