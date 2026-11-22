import { afterEach, expect, test } from 'bun:test'
import { applyTheme, readTheme, setTheme, toggleTheme } from '../public/js/lib/theme.js'

const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalLocalStorage = globalThis.localStorage

function setup({ stored = null, dark = false } = {}) {
  const store = new Map()
  if (stored !== null) store.set('monetra-theme', stored)
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    }
  }
  globalThis.document = { documentElement: { dataset: {} } }
  globalThis.window = { matchMedia: () => ({ matches: dark }) }
  return store
}

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})

test('readTheme memakai pilihan yang tersimpan', () => {
  setup({ stored: 'dark', dark: false })
  expect(readTheme()).toBe('dark')
  setup({ stored: 'light', dark: true })
  expect(readTheme()).toBe('light')
})

test('readTheme mengikuti preferensi sistem bila belum ada pilihan', () => {
  setup({ dark: true })
  expect(readTheme()).toBe('dark')
  setup({ dark: false })
  expect(readTheme()).toBe('light')
})

test('applyTheme mengubah atribut tanpa menyimpan pilihan', () => {
  const store = setup()
  expect(applyTheme('dark')).toBe('dark')
  expect(globalThis.document.documentElement.dataset.theme).toBe('dark')
  expect(store.has('monetra-theme')).toBe(false)
})

test('setTheme menyimpan pilihan', () => {
  const store = setup()
  expect(setTheme('dark')).toBe('dark')
  expect(store.get('monetra-theme')).toBe('dark')
})

test('toggleTheme membalik tema aktif', () => {
  setup({ stored: 'dark' })
  expect(toggleTheme()).toBe('light')
  setup({ stored: 'light' })
  expect(toggleTheme()).toBe('dark')
})
