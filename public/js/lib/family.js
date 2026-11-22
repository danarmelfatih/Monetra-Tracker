import { getSb } from './supabase.js'

export async function getMembers(familyId) {
  const sb = await getSb()
  const { data, error } = await sb
    .from('family_members')
    .select('id, user_id, role, status, joined_at, profiles(email, full_name, avatar_url)')
    .eq('family_id', familyId)
    .order('joined_at')
  if (error) throw error
  return data
}

export async function getPendingInvitations(familyId) {
  const sb = await getSb()
  const { data, error } = await sb
    .from('family_invitations')
    .select('id, email, role, expires_at, created_at')
    .eq('family_id', familyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function inviteMember(familyId, email, role) {
  const sb = await getSb()
  const { data, error } = await sb.rpc('create_invitation', {
    p_family_id: familyId,
    p_email: email,
    p_role: role
  })
  if (error) throw error
  return data
}

export async function acceptInvitation(token) {
  const sb = await getSb()
  const { data, error } = await sb.rpc('accept_invitation', { p_token: token })
  if (error) throw error
  return data
}

export async function cancelInvitation(id) {
  const sb = await getSb()
  const { error } = await sb
    .from('family_invitations')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) throw error
}

export async function updateMemberRole(id, role) {
  const sb = await getSb()
  const { error } = await sb
    .from('family_members')
    .update({ role })
    .eq('id', id)
  if (error) throw error
}

export async function removeMember(id) {
  const sb = await getSb()
  const { error } = await sb
    .from('family_members')
    .update({ status: 'removed' })
    .eq('id', id)
  if (error) throw error
}

export async function getFamilyName(familyId) {
  const sb = await getSb()
  const { data, error } = await sb
    .from('families').select('name').eq('id', familyId).maybeSingle()
  if (error) throw error
  return data?.name ?? ''
}

export async function renameFamily(familyId, name) {
  const sb = await getSb()
  const { error } = await sb
    .from('families').update({ name }).eq('id', familyId)
  if (error) throw error
}
