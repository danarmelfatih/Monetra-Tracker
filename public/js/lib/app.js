import { getSb } from './supabase.js'
import { requireUser, getActiveFamilyId } from './auth.js'
import { renderLayout } from '../components/layout.js'
import { GUEST_FAMILY_ID, GUEST_USER, isGuestMode } from './guest.js'

export async function initPage(activePath, options = {}) {
  if (options.guest || isGuestMode({ search: location.search })) {
    await renderLayout({
      user: GUEST_USER,
      familyName: 'Mode Tamu',
      activePath,
      familyId: GUEST_FAMILY_ID,
      greeting: options.greeting === true,
      guest: true
    })
    return { user: GUEST_USER, familyId: GUEST_FAMILY_ID, guest: true }
  }

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
  return { user, familyId, guest: false }
}
