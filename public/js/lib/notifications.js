const DAY_MS = 24 * 60 * 60 * 1000

export function notificationCutoff(date = new Date()) {
  return new Date(date.getTime() - DAY_MS).toISOString()
}

export async function getNotifications(sb, familyId, userId, date = new Date()) {
  const { data, error } = await sb.from('notifications')
    .select('id, type, title, body, href, source_id, created_at')
    .eq('family_id', familyId)
    .eq('recipient_user_id', userId)
    .is('read_at', null)
    .is('deleted_at', null)
    .gte('created_at', notificationCutoff(date))
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function markNotificationRead(sb, id) {
  const { error } = await sb.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

export async function markNotificationsRead(sb, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const { error } = await sb.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null)
  if (error) throw error
}

export async function deleteNotification(sb, id) {
  const { error } = await sb.from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
