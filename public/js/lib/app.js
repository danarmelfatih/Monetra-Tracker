import { getSb } from './supabase.js'
import { requireUser, getActiveFamilyId } from './auth.js'
import { renderLayout } from '../components/layout.js'

export async function initPage(activePath, options = {}) {
  const user = await requireUser()
  if (!user) return null

  const familyId = getActiveFamilyId(user.id)
  if (!familyId) { location.replace('/onboarding'); return null }

  const sb = await getSb()
  // Sekaligus memastikan pengguna memang anggota keluarga ini (dijaga RLS)
  const { data: family } = await sb
    .from('families').select('name').eq('id', familyId).maybeSingle()
  if (!family) {
    localStorage.removeItem(`activeFamily:${user.id}`)
    location.replace('/onboarding')
    return null
  }

  await renderLayout({ user, familyName: family.name, activePath, familyId, greeting: options.greeting === true })
  return { user, familyId }
}
