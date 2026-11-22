import { getSb } from './lib/supabase.js'
import { initPage } from './lib/app.js'
import { el } from './lib/dom.js'

const ctx = await initPage('/categories')

if (ctx) {
  const sb = await getSb()
  const { user, familyId } = ctx
  const $ = (id) => document.getElementById(id)
  const form = $('cat-form')
  const showError = (msg = '') => { $('error').textContent = msg }
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : '#64748b')

  // Hanya owner/admin yang boleh mengelola (RLS juga menjaga ini di server)
  const { data: me } = await sb.from('family_members').select('role')
    .eq('family_id', familyId).eq('user_id', user.id).maybeSingle()
  const canManage = !!me && ['owner', 'admin'].includes(me.role)
  $('btn-add').hidden = !canManage

  async function load() {
    const { data, error } = await sb.from('categories')
      .select('id, name, type, color')
      .eq('family_id', familyId).eq('is_archived', false).order('name')
    if (error) return showError(error.message)
    showError()
    for (const type of ['income', 'expense']) {
      $(`list-${type}`).replaceChildren(
        ...data.filter((c) => c.type === type).map(row))
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
    const { error } = await sb.from('categories').update({ is_archived: true }).eq('id', c.id)
    if (error) return showError(error.message)
    load()
  }

  $('btn-add').addEventListener('click', () => { form.hidden = false; $('c-name').focus() })
  $('btn-cancel').addEventListener('click', () => { form.hidden = true; form.reset() })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const { error } = await sb.from('categories').insert({
      family_id: familyId,
      name: $('c-name').value.trim(),
      type: $('c-type').value,
      color: $('c-color').value
    })
    if (error) return showError(error.message)
    form.hidden = true
    form.reset()
    load()
  })

  load()
}