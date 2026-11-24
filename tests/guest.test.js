import { afterEach, expect, test } from 'bun:test'
import { hasStoredSession, homeRedirectFor, isMobileDevice, shouldUseGuestDashboard } from '../public/js/lib/guest.js'

const originalWindow = globalThis.window
const authStore = { 'sb-project-auth-token': JSON.stringify({ access_token: 'token' }) }

function mockStorage(entries = {}) {
  const keys = Object.keys(entries)
  return {
    length: keys.length,
    key: (index) => keys[index] ?? null,
    getItem: (key) => entries[key] ?? null
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

test('shouldUseGuestDashboard mensyaratkan guest dan tanpa sesi', () => {
  expect(shouldUseGuestDashboard({ search: '?guest=1', storage: mockStorage() })).toBe(true)
  expect(shouldUseGuestDashboard({ search: '?guest=1', storage: mockStorage(authStore) })).toBe(false)
  expect(shouldUseGuestDashboard({ search: '', storage: mockStorage() })).toBe(false)
})
