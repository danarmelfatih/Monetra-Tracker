import { initPage } from '../lib/app.js'
import { el } from '../lib/dom.js'
import {
  getMembers, getPendingInvitations, inviteMember, cancelInvitation,
  updateMemberRole, removeMember, getFamilyName, renameFamily
} from '../lib/family.js'

const ctx = await initPage('/family/members')

if (ctx) {
  const { user, familyId } = ctx
  const $ = (id) => document.getElementById(id)
  const showError = (message = '') => { $('error').textContent = message }

  async function load() {
    try {
      const members = await getMembers(familyId)
      const myRole = members.find((m) => m.user_id === user.id)?.role ?? 'member'
      const owner = myRole === 'owner'
      const admin = owner || myRole === 'admin'

      $('rename-panel').hidden = !owner
      $('invite-panel').hidden = !admin
      $('pending-panel').hidden = !admin
      $('family-name').value = await getFamilyName(familyId)

      $('member-list').replaceChildren(...members.map((m) => memberRow(m, owner)))

      if (admin) {
        const invitations = await getPendingInvitations(familyId)
        $('pending-list').replaceChildren(...invitations.map((inv) =>
          el('div', { class: 'cat-row' },
            el('span', {}, `${inv.email} · ${inv.role}`),
            el('button', { class: 'btn-link', onclick: () => cancel(inv.id) }, 'Batalkan'))))
      }
    } catch (e) {
      showError(e.message)
    }
  }

  function memberRow(m, owner) {
    const label = m.profiles?.full_name || m.profiles?.email || 'Anggota'
    const email = m.profiles?.email ? ` · ${m.profiles.email}` : ''
    const isSelf = m.user_id === user.id
    const isOwner = m.role === 'owner'
    let control
    if (owner && !isSelf && !isOwner) {
      control = el('div', { class: 'row-actions' },
        el('select', { onchange: (e) => changeRole(m.id, e.target.value) },
          el('option', { value: 'member', selected: m.role === 'member' }, 'Member'),
          el('option', { value: 'admin', selected: m.role === 'admin' }, 'Admin')),
        el('button', { class: 'btn-link', onclick: () => remove(m.id) }, 'Keluarkan'))
    } else {
      control = el('span', { class: 'muted' }, m.role)
    }
    return el('div', { class: 'cat-row' },
      el('span', {}, label + email),
      el('span', { class: 'muted' }, m.status === 'active' ? 'Aktif' : 'Nonaktif'),
      control)
  }

  async function changeRole(id, role) {
    try {
      showError()
      await updateMemberRole(id, role)
      await load()
    } catch (e) {
      showError(e.message)
      await load()
    }
  }

  async function remove(id) {
    if (!confirm('Keluarkan anggota ini dari keluarga?')) return
    try {
      showError()
      await removeMember(id)
      await load()
    } catch (e) {
      showError(e.message)
    }
  }

  async function cancel(id) {
    try {
      showError()
      await cancelInvitation(id)
      await load()
    } catch (e) {
      showError(e.message)
    }
  }

  $('rename-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      showError()
      await renameFamily(familyId, $('family-name').value.trim())
      location.reload()
    } catch (err) {
      showError(err.message)
    }
  })

  $('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      showError()
      const token = await inviteMember(familyId, $('invite-email').value.trim(), $('invite-role').value)
      const link = `${location.origin}/onboarding?invite=${token}`
      const box = $('invite-link')
      box.hidden = false
      box.replaceChildren(
        el('p', { class: 'muted' }, 'Salin tautan ini kepada calon anggota (berlaku 7 hari):'),
        el('input', { readonly: true, value: link }),
        el('button', { class: 'btn btn-ghost', onclick: () => navigator.clipboard.writeText(link) }, 'Salin'))
      $('invite-email').value = ''
      await load()
    } catch (err) {
      showError(err.message)
    }
  })

  await load()
}
