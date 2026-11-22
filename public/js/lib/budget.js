const toDateString = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function monthRange(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth()
  return {
    start: toDateString(new Date(year, month, 1)),
    end: toDateString(new Date(year, month + 1, 0)),
    today: toDateString(date),
    label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date)
  }
}

export async function getBudgetOverview(sb, familyId, userId, date = new Date()) {
  const range = monthRange(date)
  const [budgetRes, categoryRes, memberRes] = await Promise.all([
    sb.from('budgets')
      .select('id, category_id, member_id, name, amount_limit, alert_threshold, period_type, start_date, end_date, categories(name)')
      .eq('family_id', familyId)
      .eq('is_archived', false)
      .order('start_date'),
    sb.from('categories')
      .select('id, name, type, is_archived')
      .eq('family_id', familyId)
      .order('name'),
    sb.from('family_members')
      .select('user_id, role, profiles(full_name, email)')
      .eq('family_id', familyId)
      .eq('status', 'active')
  ])

  const err = budgetRes.error || categoryRes.error || memberRes.error
  if (err) throw err

  const categories = categoryRes.data ?? []
  const members = memberRes.data ?? []
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const memberNames = new Map(members.map((m) => [
    m.user_id,
    m.profiles?.full_name || m.profiles?.email || 'Anggota'
  ]))
  const myRole = members.find((m) => m.user_id === userId)?.role ?? 'member'
  const active = (budgetRes.data ?? []).filter(
    (b) => b.start_date <= range.today && b.end_date >= range.today
  )

  let transactions = []
  if (active.length) {
    const txStart = active.reduce((min, b) => (b.start_date < min ? b.start_date : min), active[0].start_date)
    const txEnd = active.reduce((max, b) => (b.end_date > max ? b.end_date : max), active[0].end_date)
    const txRes = await sb.from('transactions')
      .select('amount, type, transaction_date, category_id, created_by')
      .eq('family_id', familyId)
      .eq('type', 'expense')
      .is('deleted_at', null)
      .gte('transaction_date', txStart)
      .lte('transaction_date', txEnd)
    if (txRes.error) throw txRes.error
    transactions = txRes.data ?? []
  }

  const budgets = active.map((b) => {
    const limit = Number(b.amount_limit)
    const spent = transactions.reduce((sum, t) => {
      const inPeriod = t.transaction_date >= b.start_date && t.transaction_date <= b.end_date
      const inCategory = !b.category_id || t.category_id === b.category_id
      const inMember = !b.member_id || t.created_by === b.member_id
      return t.type === 'expense' && inPeriod && inCategory && inMember ? sum + Number(t.amount) : sum
    }, 0)
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0
    const threshold = Number(b.alert_threshold) || 80
    const status = percent >= 100 ? 'danger' : percent >= threshold ? 'warn' : 'safe'
    return {
      ...b,
      limit,
      spent,
      remaining: limit - spent,
      percent,
      status,
      categoryName: b.categories?.name || categoryNames.get(b.category_id) || 'Semua kategori',
      memberName: b.member_id ? memberNames.get(b.member_id) || 'Anggota' : 'Seluruh anggota'
    }
  })

  return {
    range,
    categories,
    members,
    budgets,
    canManage: ['owner', 'admin'].includes(myRole),
    totals: budgets.reduce((acc, b) => {
      acc.limit += b.limit
      acc.spent += b.spent
      acc.remaining += b.remaining
      return acc
    }, { limit: 0, spent: 0, remaining: 0 })
  }
}
