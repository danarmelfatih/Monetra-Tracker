import { afterAll, beforeAll, expect, test } from 'bun:test'

const port = 45000 + Math.floor(Math.random() * 5000)
const base = `http://localhost:${port}`
let server

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('Server tidak siap setelah 6 detik')
}

beforeAll(async () => {
  server = Bun.spawn(['bun', 'server/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdout: 'ignore',
    stderr: 'ignore'
  })
  await waitForHealth()
})

afterAll(() => {
  if (server) server.kill()
})

test('/api/health dan /api/config merespons JSON', async () => {
  const health = await fetch(`${base}/api/health`)
  const config = await fetch(`${base}/api/config`)
  expect(health.status).toBe(200)
  expect(await health.json()).toEqual({ ok: true })
  expect(config.status).toBe(200)
  expect(config.headers.get('content-type')).toContain('application/json')
})

test('halaman utama aplikasi tersaji dengan konten yang diharapkan', async () => {
  const pages = [
    ['/', 'Kelola Keuangan Keluarga'],
    ['/', 'dashboard?guest=1'],
    ['/dashboard', 'Arus Keuangan'],
    ['/dashboard', 'Saldo Dompet Utama Keluarga'],
    ['/dashboard', 'monetra-theme'],
    ['/dashboard', 'monetra-hide-amounts'],
    ['/dashboard', 'id="total" data-amount'],
    ['/dashboard', 'id="savings-total" data-amount'],
    ['/dashboard', 'id="btn-hide-amounts"'],
    ['/dashboard', 'Budget bulan ini'],
    ['/budgets', 'id="budget-form"'],
    ['/reports', 'id="report-type"'],
    ['/transactions', 'id="tx-form"'],
    ['/transactions', 'tx-list-panel'],
    ['/wallets', 'Dompet Utama Keluarga'],
    ['/wallets', 'monetra-hide-amounts'],
    ['/wallets', 'id="btn-hide-amounts"'],
    ['/savings', 'id="savings-list"'],
    ['/savings', 'monetra-hide-amounts'],
    ['/savings', 'id="savings-total" data-amount'],
    ['/savings', 'id="btn-hide-amounts"'],
    ['/categories', 'id="cat-form"'],
    ['/login', 'login-brand'],
    ['/login', 'Selamat Datang Kembali'],
    ['/login', 'Masuk untuk melanjutkan pengelolaan keuangan Anda.'],
    ['/login', 'Lanjutkan dengan Google'],
    ['/login', 'Kembali ke Beranda']
  ]
  for (const [path, marker] of pages) {
    const response = await fetch(`${base}${path}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(marker)
  }
})

test('halaman login tidak memuat hero dan ringkasan promosi', async () => {
  const response = await fetch(`${base}/login`)
  const html = await response.text()
  const promo = [
    'Kelola Keuangan Keluarga dengan Lebih Mudah.',
    'Satu tempat untuk mencatat, memantau, dan merencanakan keuangan bersama keluarga.',
    'Ringkasan keluarga',
    'Aktivitas 6 bulan',
    'Rp 24.750.000',
    'auth-preview',
    'preview-metrics'
  ]
  expect(response.status).toBe(200)
  for (const marker of promo) expect(html).not.toContain(marker)
})

test('aset kritis dan manifest PWA tersaji', async () => {
  const assets = [
    ['/js/lib/budget.js', 'getBudgetOverview'],
    ['/js/lib/guest.js', 'shouldUseGuestDashboard'],
    ['/js/lib/notifications.js', 'getNotifications'],
    ['/js/lib/theme.js', 'toggleTheme'],
    ['/js/lib/privacy.js', 'toggleHideAmounts'],
    ['/js/components/privacy-toggle.js', 'initPrivacyToggle'],
    ['/css/marketing.css', 'login-brand'],
    ['/css/layout.css', "data-hide-amounts='true'"],
    ['/css/layout.css', 'Rp •••••••'],
    ['/js/lib/report.js', 'buildReport'],
    ['/js/lib/wallet-summary.js', 'splitWalletBalances'],
    ['/js/pages/dashboard.js', 'initPrivacyToggle'],
    ['/js/pages/dashboard.js', 'guestAvailable'],
    ['/js/pages/savings.js', 'savings-list'],
    ['/js/pages/budgets.js', 'budget-form'],
    ['/js/pages/reports.js', 'report-type'],
    ['/js/components/layout.js', 'notification-panel'],
    ['/js/components/layout.js', 'Mode Tamu'],
    ['/js/components/layout.js', 'theme-toggle'],
    ['/js/components/layout.js', 'stripNullText'],
    ['/js/lib/icons.js', 'export function icon'],
    ['/js/categories.js', './lib/app.js'],
    ['/js/lib/guest-db.js', 'openGuestDb'],
    ['/js/lib/guest-seed.js', 'defaultGuestCategories'],
    ['/js/lib/guest-store.js', 'saveGuestTransaction'],
    ['/service-worker.js', 'monetra-cache-v23'],
    ['/service-worker.js', '/js/lib/guest-store.js'],
    ['/manifest.json', 'Monetra Tracker']
  ]
  for (const [path, marker] of assets) {
    const response = await fetch(`${base}${path}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(marker)
  }
})
