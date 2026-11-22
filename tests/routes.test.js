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
    ['/dashboard', 'Budget bulan ini'],
    ['/budgets', 'id="budget-form"'],
    ['/reports', 'id="report-type"'],
    ['/transactions', 'id="tx-form"'],
    ['/wallets', 'id="wallet-form"'],
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
    ['/js/lib/report.js', 'buildReport'],
    ['/js/pages/budgets.js', 'budget-form'],
    ['/js/pages/reports.js', 'report-type'],
    ['/js/components/layout.js', 'notification-panel'],
    ['/js/components/layout.js', 'stripNullText'],
    ['/js/categories.js', './lib/app.js'],
    ['/service-worker.js', 'monetra-cache-v6'],
    ['/manifest.json', 'Monetra Tracker']
  ]
  for (const [path, marker] of assets) {
    const response = await fetch(`${base}${path}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(marker)
  }
})
