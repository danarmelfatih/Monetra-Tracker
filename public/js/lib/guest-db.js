const DB_NAME = 'monetra-guest'
const DB_VERSION = 2
const STORES = ['categories', 'wallets', 'transactions', 'transfers', 'budgets', 'savings_ledger']

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request gagal.'))
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction gagal.'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction dibatalkan.'))
  })
}

export function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

export async function openGuestDb() {
  if (!hasIndexedDb()) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    for (const name of STORES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
    }
    const tx = request.transaction
    if (tx) {
      const wallets = tx.objectStore('wallets')
      if (!wallets.indexNames.contains('scope')) wallets.createIndex('scope', 'scope', { unique: false })
      if (!wallets.indexNames.contains('type')) wallets.createIndex('type', 'type', { unique: false })
      const ledger = tx.objectStore('savings_ledger')
      if (!ledger.indexNames.contains('entry_date')) ledger.createIndex('entry_date', 'entry_date', { unique: false })
      if (!ledger.indexNames.contains('kind')) ledger.createIndex('kind', 'kind', { unique: false })
    }
  }
  return req(request)
}

export async function getAllGuest(storeName) {
  const db = await openGuestDb()
  try {
    const tx = db.transaction(storeName, 'readonly')
    return await req(tx.objectStore(storeName).getAll())
  } finally {
    db.close()
  }
}

export async function putGuest(storeName, value) {
  const db = await openGuestDb()
  try {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function putManyGuest(storeName, values) {
  if (!Array.isArray(values) || values.length === 0) return
  const db = await openGuestDb()
  try {
    const tx = db.transaction(storeName, 'readwrite')
    for (const value of values) tx.objectStore(storeName).put(value)
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function clearGuestStores() {
  if (!hasIndexedDb()) return
  const db = await openGuestDb()
  try {
    const tx = db.transaction(STORES, 'readwrite')
    for (const name of STORES) tx.objectStore(name).clear()
    await txDone(tx)
  } finally {
    db.close()
  }
}

export function makeGuestId(prefix = 'id') {
  const value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

export function nowIso() {
  return new Date().toISOString()
}
