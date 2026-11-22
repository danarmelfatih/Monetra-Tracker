import { expect, test } from 'bun:test'
import { getBudgetOverview, monthRange } from '../public/js/lib/budget.js'

function mockSupabase(responses) {
  return {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        then(resolve, reject) {
          return Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve, reject)
        }
      }
      return builder
    }
  }
}

test('monthRange memakai tanggal lokal yang tepat', () => {
  expect(monthRange(new Date(2026, 10, 15))).toEqual({
    start: '2026-11-01',
    end: '2026-11-30',
    today: '2026-11-15',
    label: 'November 2026'
  })
})

test('getBudgetOverview menghitung status dan total budget per kategori, anggota, dan keluarga', async () => {
  const today = new Date(2026, 10, 15)
  const range = monthRange(today)
  const sb = mockSupabase({
    budgets: {
      data: [
        {
          id: 'b1', category_id: 'c1', member_id: null, name: 'Makanan', amount_limit: 100000,
          alert_threshold: 80, start_date: range.start, end_date: range.end,
          categories: { name: 'Makanan' }
        },
        {
          id: 'b2', category_id: null, member_id: null, name: 'Keluarga', amount_limit: 500000,
          alert_threshold: 80, start_date: range.start, end_date: range.end, categories: null
        },
        {
          id: 'b3', category_id: null, member_id: 'u1', name: 'Andi', amount_limit: 20000,
          alert_threshold: 80, start_date: range.start, end_date: range.end, categories: null
        }
      ],
      error: null
    },
    categories: { data: [{ id: 'c1', name: 'Makanan', type: 'expense', is_archived: false }], error: null },
    family_members: {
      data: [{ user_id: 'u1', role: 'owner', profiles: { full_name: 'Andi', email: 'andi@example.com' } }],
      error: null
    },
    transactions: {
      data: [
        {
          amount: 90000, type: 'expense', transaction_date: '2026-11-10',
          category_id: 'c1', created_by: 'u1'
        },
        {
          amount: 50000, type: 'income', transaction_date: '2026-11-11',
          category_id: 'c1', created_by: 'u1'
        }
      ],
      error: null
    }
  })

  const result = await getBudgetOverview(sb, 'f1', 'u1', today)
  const category = result.budgets.find((b) => b.id === 'b1')
  const family = result.budgets.find((b) => b.id === 'b2')
  const member = result.budgets.find((b) => b.id === 'b3')

  expect(result.budgets).toHaveLength(3)
  expect(result.canManage).toBe(true)
  expect(category.spent).toBe(90000)
  expect(category.percent).toBe(90)
  expect(category.status).toBe('warn')
  expect(family.status).toBe('safe')
  expect(member.status).toBe('danger')
  expect(result.totals).toEqual({ limit: 620000, spent: 270000, remaining: 350000 })
})

test('getBudgetOverview mengabaikan budget tidak aktif', async () => {
  const today = new Date(2026, 10, 15)
  const sb = mockSupabase({
    budgets: {
      data: [{
        id: 'old', category_id: null, member_id: null, name: 'Lama', amount_limit: 100000,
        alert_threshold: 80, start_date: '2026-10-01', end_date: '2026-10-31', categories: null
      }],
      error: null
    },
    categories: { data: [], error: null },
    family_members: { data: [{ user_id: 'u1', role: 'member', profiles: null }], error: null }
  })

  const result = await getBudgetOverview(sb, 'f1', 'u1', today)
  expect(result.budgets).toHaveLength(0)
  expect(result.canManage).toBe(false)
  expect(result.totals).toEqual({ limit: 0, spent: 0, remaining: 0 })
})
