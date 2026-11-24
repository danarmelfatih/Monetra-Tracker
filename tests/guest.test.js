import { afterEach, expect, test } from 'bun:test'
import { clearGuestMode, guestHref, hasStoredSession, homeRedirectFor, isGuestMode, isMobileDevice, shouldUseGuestDashboard } from '../public/js/lib/guest.js'

const originalWindow = globalThis.window
const authStore = { 'sb-project-auth-token': JSON.stringify({ access_token: 'token' }) }

function mockStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) }
  }
}

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('isMobileDevice membaca user agent, media query, dan lebar viewport', () => {
  expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14)', 1280)).toBe(true)
  expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 1280)).toBe(true)
  expect(isMobileDevice('Mozilla/5.0 (X11; Linux x86_64)', 390)).toBe(true)

  globalThis.window = { matchMedia: () => ({ matches: true }) }
  expect(isMobileDevice('Mozilla/5.0 (X11; Linux x86_64)', 1440)).toBe(true)

  globalThis.window = { matchMedia: () => ({ matches: false }) }
  expect(isMobileDevice('Mozilla/5.0 (X11; Linux x86_64)', 1440)).toBe(false)
})

test('hasStoredSession hanya menghitung token auth Supabase', () => {
  expect(hasStoredSession(mockStorage(authStore))).toBe(true)
  expect(hasStoredSession(mockStorage({ 'sb-project-auth-token': '{}' }))).toBe(false)
  expect(hasStoredSession(mockStorage({ other: 'access_token' }))).toBe(false)
  expect(hasStoredSession(mockStorage())).toBe(false)
})

test('homeRedirectFor mengikuti status login dan perangkat', () => {
  expect(homeRedirectFor({ userAgent: 'Android', width: 412, storage: mockStorage() })).toBe('/dashboard?guest=1')
  expect(homeRedirectFor({ userAgent: 'Desktop', width: 1440, storage: mockStorage() })).toBe(null)
  expect(homeRedirectFor({ userAgent: 'Desktop', width: 1440, storage: mockStorage(authStore) })).toBe('/dashboard')
})

test('isGuestMode mempertahankan flag lokal dan dibersihkan saat sesi ada', () => {
  const store = mockStorage()
  expect(isGuestMode({ search: '?guest=1', storage: store })).toBe(true)
  expect(isGuestMode({ search: '', storage: store })).toBe(true)
  clearGuestMode(store)
  expect(isGuestMode({ search: '', storage: store })).toBe(false)
  expect(isGuestMode({ search: '?guest=1', storage: mockStorage(authStore) })).toBe(false)
})

test('guestHref menambah guest=1 hanya saat guest mode aktif', () => {
  const originalLocation = globalThis.location
  globalThis.location = { search: '?guest=1' }
  expect(guestHref('/transactions?new=1')).toBe('/transactions?new=1&guest=1')
  globalThis.location = { search: '' }
  expect(guestHref('/transactions?new=1')).toBe('/transactions?new=1')
  if (originalLocation === undefined) delete globalThis.location
  else globalThis.location = originalLocation
})
