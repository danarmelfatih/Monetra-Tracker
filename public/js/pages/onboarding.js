import { getSb } from '../lib/supabase.js'
import { requireUser, getMyFamilies, withTimeout, setActiveFamily } from '../lib/auth.js'
import { acceptInvitation } from '../lib/family.js'
import { el } from '../lib/dom.js'

const $ = (id) => document.getElementById(id)
const loading = $('loading')
const createBox = $('create-box')
const errorEl = $('error')
const form = $('family-form')
const nameInput = $('family-name')
const inviteBox = $('invite-box')
const btnAccept = $('btn-accept')
const btnRetry = $('btn-retry')
const familyListBox = $('family-list-box')
const familyList = $('family-list')

// Simpan token undangan agar tidak hilang saat pengguna harus login dulu
const urlInvite = new URLSearchParams(location.search).get('invite')
if (urlInvite) sessionStorage.setItem('pendingInvite', urlInvite)
const inviteToken = urlInvite || sessionStorage.getItem('pendingInvite')

let currentUser = null

function showError(message = '') {
  errorEl.textContent = message
}

btnRetry.addEventListener('click', () => location.reload())

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  showError()
  const submit = form.querySelector('button[type="submit"]')
  submit.disabled = true
  try {
    const sb = await getSb()
    const { data: familyId, error } = await sb.rpc('create_family', {
      p_name: nameInput.value.trim()
    })
    if (error) throw error
    setActiveFamily(currentUser.id, familyId)
    location.replace('/dashboard')
  } catch (err) {
    showError(err.message)
    submit.disabled = false
  }
})

btnAccept.addEventListener('click', async () => {
  showError()
  btnAccept.disabled = true
  try {
    const familyId = await acceptInvitation(inviteToken)
    sessionStorage.removeItem('pendingInvite')
    setActiveFamily(currentUser.id, familyId)
    location.replace('/dashboard')
  } catch (err) {
    showError(err.message)
    btnAccept.disabled = false
  }
})

try {
  currentUser = await withTimeout(
    requireUser(),
    15000,
    'Waktu tunggu habis saat memeriksa sesi.'
  )

  if (!currentUser) {
    // requireUser sudah mengalihkan ke /login
    loading.textContent = 'Sesi tidak ditemukan. Mengalihkan ke halaman masuk...'
  } else if (inviteToken) {
    loading.hidden = true
    inviteBox.hidden = false
  } else {
    const families = await withTimeout(
      getMyFamilies(currentUser.id),
      10000,
      'Waktu tunggu habis saat memuat data keluarga.'
    )
    loading.hidden = true
    if (families.length > 0) {
      familyListBox.hidden = false
      familyList.replaceChildren(...families.map((f) =>
        el('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onclick: () => {
            setActiveFamily(currentUser.id, f.family_id)
            location.replace('/dashboard')
          }
        }, f.families?.name ?? 'Keluarga')))
    }
    createBox.hidden = false
  }
} catch (e) {
  loading.hidden = true
  showError(e.message)
  btnRetry.hidden = false
}