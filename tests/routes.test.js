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
    ['/dashboard', 'Arus Keuangan'],
    ['/dashboard', 'Total Saldo (Siap Pakai)'],
    ['/dashboard', 'monetra-theme'],
    ['/dashboard', 'monetra-hide-amounts'],
    ['/dashboard', 'id="total" data-amount'],
    ['/dashboard', 'Budget bulan ini'],
    ['/budgets', 'id="budget-form"'],
    ['/reports', 'id="report-type"'],
    ['/transactions', 'id="tx-form"'],
    ['/transactions', 'tx-list-panel'],
    ['/wallets', 'id="wallet-form"'],
    ['/savings', 'id="savings-list"'],
    ['/savings', 'monetra-hide-amounts'],
    ['/savings', 'id="savings-total" data-amount'],
    ['/categories', 'id="cat-form"'],
    ['/login', 'Lanjutkan dengan Google']
  ]
  for (const [path, marker] of pages) {
    const response = await fetch(`${base}${path}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(marker)
  }
})

test('aset kritis dan manifest PWA tersaji', async () => {
  const assets = [
    ['/js/lib/budget.js', 'getBudgetOverview'],
    ['/js/lib/notifications.js', 'getNotifications'],
    ['/js/lib/theme.js', 'toggleTheme'],
    ['/js/lib/privacy.js', 'toggleHideAmounts'],
    ['/css/layout.css', "data-hide-amounts='true'"],
    ['/js/lib/report.js', 'buildReport'],
    ['/js/lib/wallet-summary.js', 'splitWalletBalances'],
    ['/js/pages/savings.js', 'savings-list'],
    ['/js/pages/budgets.js', 'budget-form'],
    ['/js/pages/reports.js', 'report-type'],
    ['/js/components/layout.js', 'notification-panel'],
    ['/js/components/layout.js', 'theme-toggle'],
    ['/js/components/layout.js', 'privacy-toggle'],
    ['/js/components/layout.js', 'stripNullText'],
    ['/js/lib/icons.js', 'export function icon'],
    ['/js/categories.js', './lib/app.js'],
    ['/service-worker.js', 'monetra-cache-v13'],
    ['/manifest.json', 'Monetra Tracker']
  ]
  for (const [path, marker] of assets) {
    const response = await fetch(`${base}${path}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(marker)
  }
})
