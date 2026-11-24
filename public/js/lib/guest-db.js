const DB_NAME = 'monetra-guest'
const DB_VERSION = 1
const STORES = ['categories', 'wallets', 'transactions', 'transfers', 'budgets']

let dbPromise = null

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request gagal'))
  })
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaksi gagal'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaksi dibatalkan'))
  })
}

export function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

export function openGuestDb() {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB tidak tersedia di perangkat ini.'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB'))
  })
  return dbPromise
}

export async function getAllGuest(storeName) {
  const db = await openGuestDb()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  const rows = await req(store.getAll())
  await txDone(tx)
  return Array.isArray(rows) ? rows : []
}

export async function putGuest(storeName, value) {
  const db = await openGuestDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(value)
  await txDone(tx)
  return value
}

export async function putManyGuest(storeName, values) {
  const db = await openGuestDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  for (const value of values) store.put(value)
  await txDone(tx)
  return values
}

export async function clearGuestStores() {
  const db = await openGuestDb()
  const tx = db.transaction(STORES, 'readwrite')
  for (const name of STORES) tx.objectStore(name).clear()
  await txDone(tx)
}

export function makeGuestId(prefix = 'guest') {
  const id = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${id || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

export function nowIso() {
  return new Date().toISOString()
}