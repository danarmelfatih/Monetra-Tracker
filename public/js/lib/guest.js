const MOBILE_UA = /android|iphone|ipad|ipod|mobile/i
const AUTH_KEY = /^sb-.*-auth-token$/

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

export function homeRedirectFor({ userAgent = '', width = 0, storage } = {}) {
  if (hasStoredSession(storage)) return '/dashboard'
  if (isMobileDevice(userAgent, width)) return '/dashboard?guest=1'
  return null
}

export function shouldUseGuestDashboard({ search = '', userAgent = '', width = 0, storage } = {}) {
  const params = typeof URLSearchParams === 'function' ? new URLSearchParams(search) : null
  return params?.get('guest') === '1' && !hasStoredSession(storage)
}
