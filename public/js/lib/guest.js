const MOBILE_UA = /android|iphone|ipad|ipod|mobile/i
const AUTH_KEY = /^sb-.*-auth-token$/
export const GUEST_FLAG_KEY = 'monetra-guest-mode'
export const GUEST_FAMILY_ID = 'guest-family'
export const GUEST_USER_ID = 'guest-user'
export const GUEST_USER = {
  id: GUEST_USER_ID,
  email: '',
  user_metadata: { full_name: 'Tamu' }
}

export function isMobileDevice(userAgent = '', width = 0) {
  const ua = typeof userAgent === 'string' ? userAgent : ''
  const viewport = Number(width)
  const media = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 767px)').matches
    : false
  return MOBILE_UA.test(ua) || media || (Number.isFinite(viewport) && viewport > 0 && viewport <= 767)
}

export function hasStoredSession(storage) {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
    if (!store || typeof store.length !== 'number') return false
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (!key || !AUTH_KEY.test(key)) continue
      const raw = store.getItem(key)
      if (raw && raw.includes('access_token')) return true
    }
  } catch {}
  return false
}

export function isGuestMode({ search = '', storage } = {}) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  const params = typeof URLSearchParams === 'function' ? new URLSearchParams(search) : null
  if (hasStoredSession(store)) return false
  if (params?.get('guest') === '1') {
    try { store?.setItem(GUEST_FLAG_KEY, '1') } catch {}
    return true
  }
  try { return store?.getItem(GUEST_FLAG_KEY) === '1' } catch {}
  return false
}

export function enableGuestMode(storage) {
  try { (storage ?? localStorage).setItem(GUEST_FLAG_KEY, '1') } catch {}
}

export function clearGuestMode(storage) {
  try { (storage ?? localStorage).removeItem(GUEST_FLAG_KEY) } catch {}
}

export function homeRedirectFor({ userAgent = '', width = 0, storage } = {}) {
  if (hasStoredSession(storage)) return '/dashboard'
  if (isMobileDevice(userAgent, width)) return '/dashboard?guest=1'
  return null
}

export function shouldUseGuestDashboard({ search = '', userAgent = '', width = 0, storage } = {}) {
  return isGuestMode({ search, storage })
}

export function guestHref(path) {
  if (!path || typeof path !== 'string') return '/dashboard?guest=1'
  if (/^https?:\/\//.test(path) || path.startsWith('mailto:') || path.startsWith('tel:')) return path
  try {
    const url = new URL(path, 'http://monetra.local')
    if (!isGuestMode({ search: location.search })) return path
    url.searchParams.set('guest', '1')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return path
  }
}
