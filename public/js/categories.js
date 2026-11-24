import { getSb } from './lib/supabase.js'
import { initPage } from './lib/app.js'
import { el } from './lib/dom.js'
import { guestAvailable, listGuestCategories, createGuestCategory, archiveGuestCategory } from './lib/guest-store.js'

const ctx = await initPage('/categories')

if (ctx) {
  const $ = (id) => document.getElementById(id)
  const form = $('cat-form')
  const guest = ctx.guest === true
  const sb = guest ? null : await getSb()
  const { user, familyId } = ctx
  const showError = (msg = '') => { $('error').textContent = msg }
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : '#64748b')

  let canManage = guest
  if (!guest) {
    const { data: me } = await sb.from('family_members').select('role')
      .eq('family_id', familyId).eq('user_id', user.id).maybeSingle()
    canManage = !!me && ['owner', 'admin'].includes(me.role)
  }
  $('btn-add').hidden = !canManage

  async function load() {
    try {
      if (guest) {
        const ok = await guestAvailable()
        if (!ok) throw new Error('IndexedDB tidak tersedia di perangkat ini.')
      }
      let data = []
      if (guest) {
        data = await listGuestCategories()
      } else {
        const res = await sb.from('categories')
          .select('id, name, type, color')
          .eq('family_id', familyId).eq('is_archived', false).order('name')
        if (res.error) throw res.error
        data = res.data
      }
      showError()
      for (const type of ['income', 'expense']) {
        $(`list-${type}`).replaceChildren(...data.filter((c) => c.type === type).map(row))
      }
    } catch (e) {
      showError(e.message)
    }
  }

  function row(c) {
    const dot = el('span', { class: 'dot' })
    dot.style.background = safeColor(c.color)
    return el('li', { class: 'cat-row' },
      dot,
      el('span', { class: 'cat-name' }, c.name),
      canManage ? el('button', { class: 'btn-link', onclick: () => archive(c) }, 'Arsipkan') : null)
  }

  async function archive(c) {
    if (!confirm(`Arsipkan kategori "${c.name}"?`)) return
    try {
      if (guest) await archiveGuestCategory(c.id)
      else {
        const { error } = await sb.from('categories').update({ is_archived: true }).eq('id', c.id)
        if (error) throw error
      }
      await load()
    } catch (e) {
      showError(e.message)
    }
  }

  $('btn-add').addEventListener('click', () => { form.hidden = false; $('c-name').focus() })
  $('btn-cancel').addEventListener('click', () => { form.hidden = true; form.reset() })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      if (guest) {
        await createGuestCategory({
          name: $('c-name').value.trim(),
          type: $('c-type').value,
          color: $('c-color').value
        })
      } else {
        const { error } = await sb.from('categories').insert({
          family_id: familyId,
          name: $('c-name').value.trim(),
          type: $('c-type').value,
          color: $('c-color').value
        })
        if (error) throw error
      }
      form.hidden = true
      form.reset()
      await load()
    } catch (err) {
      showError(err.message)
    }
  })

  await load()
}