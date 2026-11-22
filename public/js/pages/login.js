import { getSb } from '../lib/supabase.js'
import { signInWithGoogle, withTimeout } from '../lib/auth.js'

const button = document.getElementById('btn-google')
const label = document.getElementById('btn-label')
const spinner = document.getElementById('spinner')
const errorEl = document.getElementById('error')
const offlineEl = document.getElementById('offline')
const statusEl = document.getElementById('status')

const idleLabel = 'Lanjutkan dengan Google'
let loading = false
let succeeded = false

function showError(message = '') {
  errorEl.textContent = message
  errorEl.hidden = !message
}

function syncButton() {
  button.disabled = loading || succeeded
}

function updateConnection() {
  offlineEl.hidden = navigator.onLine
}

function setBusy(text) {
  loading = true
  label.textContent = text
  spinner.hidden = false
  statusEl.textContent = text
  syncButton()
}

function setIdle() {
  loading = false
  label.textContent = idleLabel
  spinner.hidden = true
  statusEl.textContent = ''
  syncButton()
}

const forwarded = new URLSearchParams(location.search).get('error')
if (forwarded) showError(forwarded)

window.addEventListener('online', updateConnection)
window.addEventListener('offline', updateConnection)
updateConnection()

// Jika pengguna menekan tombol Kembali dari halaman Google, pulihkan tombolnya
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !succeeded) setIdle()
})

button.addEventListener('click', async () => {
  if (loading || succeeded) return
  showError()
  if (!navigator.onLine) {
    showError('Koneksi internet diperlukan untuk masuk.')
    return
  }

  setBusy('Menghubungkan akun Google...')
  try {
    await withTimeout(
      signInWithGoogle(),
      10000,
      'Waktu tunggu habis. Periksa koneksi internet Anda.'
    )
    // Browser sedang dialihkan ke Google. Jangan ada navigasi lain di sini.
    setBusy('Mengalihkan ke Google...')
  } catch (e) {
    setIdle()
    showError(e.message)
  }
})

// Jika sudah punya sesi, langsung lanjut ke onboarding
try {
  const sb = await getSb()
  const { data: { session } } = await withTimeout(
    sb.auth.getSession(),
    10000,
    'Waktu tunggu habis saat memeriksa sesi.'
  )
  if (session) {
    succeeded = true
    label.textContent = 'Berhasil masuk. Mengalihkan...'
    statusEl.textContent = 'Berhasil masuk. Mengalihkan...'
    syncButton()
    location.replace('/onboarding')
  }
} catch (e) {
  showError(e.message)
}