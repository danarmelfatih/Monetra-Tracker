import { afterEach, expect, test } from 'bun:test'
import { applyHideAmounts, readHideAmounts, setHideAmounts, toggleHideAmounts } from '../public/js/lib/privacy.js'

const originalDocument = globalThis.document
const originalLocalStorage = globalThis.localStorage

function setup(stored = null) {
  const store = new Map()
  if (stored !== null) store.set('monetra-hide-amounts', stored)
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    }
  }
  globalThis.document = { documentElement: { dataset: {} } }
  return store
}

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
})

test('readHideAmounts membaca pilihan yang tersimpan', () => {
  setup('true')
  expect(readHideAmounts()).toBe(true)
  setup('false')
  expect(readHideAmounts()).toBe(false)
  setup()
  expect(readHideAmounts()).toBe(false)
})

test('applyHideAmounts mengubah atribut tanpa menyimpan pilihan', () => {
  const store = setup()
  expect(applyHideAmounts(true)).toBe(true)
  expect(globalThis.document.documentElement.dataset.hideAmounts).toBe('true')
  expect(store.has('monetra-hide-amounts')).toBe(false)
})

test('setHideAmounts menyimpan pilihan', () => {
  const store = setup()
  expect(setHideAmounts(true)).toBe(true)
  expect(store.get('monetra-hide-amounts')).toBe('true')
})

test('toggleHideAmounts membalik status nominal', () => {
  setup('true')
  expect(toggleHideAmounts()).toBe(false)
  setup('false')
  expect(toggleHideAmounts()).toBe(true)
  setup()
  expect(toggleHideAmounts()).toBe(true)
})
