import { expect, test } from 'bun:test'
import { deleteNotification, getNotifications, markNotificationsRead, notificationCutoff } from '../public/js/lib/notifications.js'

function mockSupabase(response) {
  const calls = []
  const builder = {
    select: (columns) => {
      calls.push(['select', columns])
      return builder
    },
    eq: (column, value) => {
      calls.push(['eq', column, value])
      return builder
    },
    is: (column, value) => {
      calls.push(['is', column, value])
      return builder
    },
    gte: (column, value) => {
      calls.push(['gte', column, value])
      return builder
    },
    order: (column, options) => {
      calls.push(['order', column, options])
      return builder
    },
    update: (payload) => {
      calls.push(['update', payload])
      return builder
    },
    in: (column, values) => {
      calls.push(['in', column, values])
      return builder
    },
    then(resolve, reject) {
      return Promise.resolve(response).then(resolve, reject)
    }
  }
  return {
    calls,
    from: (table) => {
      calls.push(['from', table])
      return builder
    }
  }
}

test('notificationCutoff menghasilkan batas 24 jam', () => {
  expect(notificationCutoff(new Date('2026-11-22T12:00:00.000Z'))).toBe('2026-11-21T12:00:00.000Z')
})

test('getNotifications hanya mengambil notifikasi milik penerima yang belum dibaca dan masih segar', async () => {
  const sb = mockSupabase({ data: [{ id: 'n1' }], error: null })
  const result = await getNotifications(sb, 'f1', 'u1', new Date('2026-11-22T12:00:00.000Z'))

  expect(result).toEqual([{ id: 'n1' }])
  expect(sb.calls).toContainEqual(['from', 'notifications'])
  expect(sb.calls).toContainEqual(['eq', 'family_id', 'f1'])
  expect(sb.calls).toContainEqual(['eq', 'recipient_user_id', 'u1'])
  expect(sb.calls).toContainEqual(['is', 'read_at', null])
  expect(sb.calls).toContainEqual(['is', 'deleted_at', null])
  expect(sb.calls).toContainEqual(['gte', 'created_at', '2026-11-21T12:00:00.000Z'])
  expect(sb.calls).toContainEqual(['order', 'created_at', { ascending: false }])
})

test('markNotificationsRead melewati daftar kosong', async () => {
  const sb = mockSupabase({ data: null, error: null })
  await markNotificationsRead(sb, [])
  expect(sb.calls).toHaveLength(0)
})

test('markNotificationsRead menandai banyak notifikasi sekaligus', async () => {
  const sb = mockSupabase({ data: null, error: null })
  await markNotificationsRead(sb, ['n1', 'n2'])
  expect(sb.calls).toContainEqual(['update', { read_at: expect.any(String) }])
  expect(sb.calls).toContainEqual(['in', 'id', ['n1', 'n2']])
  expect(sb.calls).toContainEqual(['is', 'read_at', null])
})

test('deleteNotification memakai soft delete', async () => {
  const sb = mockSupabase({ data: null, error: null })
  await deleteNotification(sb, 'n1')
  expect(sb.calls).toContainEqual(['update', { deleted_at: expect.any(String) }])
  expect(sb.calls).toContainEqual(['eq', 'id', 'n1'])
})
