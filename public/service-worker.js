const CACHE_NAME = 'monetra-cache-v21'
const essentialUrls = [
  '/',
  '/login',
  '/onboarding',
  '/dashboard',
  '/transactions',
  '/budgets',
  '/reports',
  '/wallets',
  '/savings',
  '/categories',
  '/family/members',
  '/css/marketing.css',
  '/css/layout.css',
  '/vendor/supabase.js',
  '/js/pages/landing.js',
  '/js/pages/login.js',
  '/js/pages/dashboard.js',
  '/js/pages/transactions.js',
  '/js/pages/budgets.js',
  '/js/pages/reports.js',
  '/js/pages/wallet.js',
  '/js/pages/savings.js',
  '/js/categories.js',
  '/js/components/layout.js',
  '/js/components/privacy-toggle.js',
  '/js/lib/config.js',
  '/js/lib/supabase.js',
  '/js/lib/auth.js',
  '/js/lib/app.js',
  '/js/lib/dom.js',
  '/js/lib/format.js',
  '/js/lib/icons.js',
  '/js/lib/budget.js',
  '/js/lib/notifications.js',
  '/js/lib/theme.js',
  '/js/lib/privacy.js',
  '/js/lib/report.js',
  '/js/lib/wallet-summary.js',
  '/js/lib/guest.js',
  '/js/lib/guest-db.js',
  '/js/lib/guest-seed.js',
  '/js/lib/guest-store.js',
  '/manifest.json'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(essentialUrls))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key)
      })))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
        }
        return networkResponse
      }).catch(() => new Response('Offline, konten ini belum tersedia.', {
        status: 503,
        statusText: 'Offline'
      }))
    })
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'queue-sync') {
    event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'sync-queue' }))
    }))
  }
})
