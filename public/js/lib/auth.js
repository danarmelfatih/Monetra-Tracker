import { getSb } from './supabase.js'
import { clearGuestMode } from './guest.js'

export function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

// Membuat tautan login Google lalu mengalihkan browser ke sana.
// Setelah fungsi ini selesai, JANGAN melakukan navigasi lain.
export async function signInWithGoogle() {
  const sb = await getSb()
  clearGuestMode()
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/onboarding`,
      skipBrowserRedirect: true
    }
  })
  if (error) throw error
  if (!data?.url) throw new Error('Gagal membuat tautan login Google.')
  location.assign(data.url)
}

export async function requireUser() {
  const sb = await getSb()
  let session = null
  try {
    ({ data: { session } } = await sb.auth.getSession())
  } catch {}
  if (session) return session.user

  let user = null
  try {
    ({ data: { user } } = await sb.auth.getUser())
  } catch {}
  if (user) return user

  const params = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  let detail =
    params.get('error_description') ||
    hash.get('error_description') ||
    params.get('error')
  if (!detail && params.get('code')) {
    detail = 'Login belum berhasil diproses. Silakan coba lagi.'
  }
  location.replace(detail ? `/login?error=${encodeURIComponent(detail)}` : '/login')
  return null
}

export function getActiveFamilyId(userId) {
  return localStorage.getItem(`activeFamily:${userId}`)
}

export function setActiveFamily(userId, familyId) {
  localStorage.setItem(`activeFamily:${userId}`, familyId)
}

export async function signOut() {
  const sb = await getSb()
  await sb.auth.signOut()
  location.replace('/login')
}

export async function getMyFamilies(userId) {
  const sb = await getSb()
  const { data, error } = await sb
    .from('family_members')
    .select('role, family_id, families(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error) {
    if (error.code === '42501') {
      throw new Error('Izin database belum benar. Jalankan migration 20261121000000_fix_permissions.sql di Supabase SQL Editor.')
    }
    throw error
  }
  return data
}