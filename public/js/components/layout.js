import { el } from '../lib/dom.js'
import { signOut, getMyFamilies, setActiveFamily } from '../lib/auth.js'
import { getSb } from '../lib/supabase.js'
import { getBudgetOverview } from '../lib/budget.js'
import { formatRupiah } from '../lib/format.js'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/transactions', label: 'Transaksi', icon: '🧾' },
  { href: '/budgets', label: 'Budget' },
  { href: '/reports', label: 'Laporan' },
  { href: '/wallets', label: 'Dompet', icon: '👛' },
  { href: '/categories', label: 'Kategori', icon: '🏷️' },
  { href: '/family/members', label: 'Anggota', icon: '👥' }
]

const cleanText = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (!text || ['null', 'undefined'].includes(text.toLowerCase())) return fallback
  return text
}

const stripNullText = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    if (/^\s*(null|undefined)\s*$/i.test(node.nodeValue ?? '')) node.nodeValue = ''
  }
}

const bellIcon = () => {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const body = document.createElementNS(ns, 'path')
  body.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9')
  const clapper = document.createElementNS(ns, 'path')
  clapper.setAttribute('d', 'M10 21h4')
  svg.append(body, clapper)
  return svg
}

export async function renderLayout({ user, familyName, activePath, familyId }) {
  const familyLabel = cleanText(familyName, 'Keluarga')
  const userName = cleanText(user.user_metadata?.full_name, cleanText(user.email, 'Anggota'))
  const userEmail = cleanText(user.email, '')
  const initial = userName.charAt(0).toUpperCase()

  const link = (n) =>
    el('a', { href: n.href, class: n.href === activePath ? 'active' : '' },
      n.icon ? el('span', { class: 'ico' }, n.icon) : null,
      el('span', {}, n.label))

  const sidebarUser = el('div', { class: 'sidebar-user' },
    el('span', { class: 'sidebar-user-name' }, userName),
    userEmail ? el('span', { class: 'sidebar-user-email' }, userEmail) : null,
    el('button', { class: 'btn btn-ghost', onclick: signOut }, 'Keluar'))

  document.getElementById('sidebar')
    .replaceChildren(
      el('div', { class: 'brand' }, 'Monetra'),
      ...NAV.map(link),
      sidebarUser
    )

  document.getElementById('bottomnav')
    .replaceChildren(...NAV.map(link))

  let switcher = null
  try {
    const families = await getMyFamilies(user.id)
    if (families.length > 1) {
      switcher = el('select', {
        class: 'family-switch',
        'aria-label': 'Ganti keluarga',
        onchange: (e) => {
          setActiveFamily(user.id, e.target.value)
          location.reload()
        }
      }, ...families.map((f) => el('option', {
        value: f.family_id,
        selected: f.family_id === familyId
      }, cleanText(f.families?.name, 'Keluarga'))))
    }
  } catch {
    switcher = null
  }

  const setPanel = (panel, button, open) => {
    panel.hidden = !open
    button.setAttribute('aria-expanded', String(open))
  }

  const notificationList = el('div', { class: 'notification-list' },
    el('p', { class: 'notification-empty' }, 'Memuat notifikasi budget keluarga...'))
  const notificationPanel = el('div', {
    class: 'notification-panel', id: 'notification-panel', hidden: true
  },
  el('div', { class: 'notification-head' }, el('strong', {}, 'Notifikasi')),
  notificationList)
  const badge = el('span', { class: 'notification-badge', hidden: true })
  const notificationButton = el('button', {
    class: 'icon-button', type: 'button', 'aria-label': 'Notifikasi',
    'aria-expanded': 'false', 'aria-controls': 'notification-panel'
  }, bellIcon(), badge)

  const profilePanel = el('div', { class: 'profile-panel', id: 'profile-panel', hidden: true },
    el('strong', {}, userName),
    userEmail ? el('span', { class: 'muted' }, userEmail) : null,
    el('span', { class: 'muted' }, familyLabel),
    el('a', { href: '/family/members' }, 'Lihat anggota keluarga'),
    el('button', { class: 'btn btn-ghost profile-logout', onclick: signOut }, 'Keluar'))

  const profileButton = el('button', {
    class: 'profile-button', type: 'button',
    'aria-expanded': 'false', 'aria-controls': 'profile-panel',
    onclick: () => {
      const open = profilePanel.hidden
      setPanel(profilePanel, profileButton, open)
      if (open) setPanel(notificationPanel, notificationButton, false)
    }
  },
  el('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
  el('span', {}, 'Profil'))

  notificationButton.addEventListener('click', () => {
    const open = notificationPanel.hidden
    setPanel(notificationPanel, notificationButton, open)
    if (open) {
      setPanel(profilePanel, profileButton, false)
      const ids = notificationItems.map((item) => item.id)
      if (ids.length) {
        try {
          localStorage.setItem(readKey, JSON.stringify(ids))
        } catch {
          badge.hidden = true
        }
      }
      badge.hidden = true
    }
  })

  document.addEventListener('click', (event) => {
    if (!profilePanel.hidden && !profilePanel.contains(event.target) && !profileButton.contains(event.target)) {
      setPanel(profilePanel, profileButton, false)
    }
    if (!notificationPanel.hidden && !notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
      setPanel(notificationPanel, notificationButton, false)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    setPanel(profilePanel, profileButton, false)
    setPanel(notificationPanel, notificationButton, false)
  })

  const header = document.getElementById('header')
  header.replaceChildren(
    el('strong', {}, familyLabel),
    switcher,
    el('div', { class: 'header-actions' },
      el('div', { class: 'notification-wrap' }, notificationButton, notificationPanel),
      el('div', { class: 'header-profile' }, profileButton, profilePanel))
  )
  stripNullText(header)

  const readKey = `notifications-read:${user.id}`
  let notificationItems = []

  const readIds = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(readKey) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  }

  const renderNotifications = () => {
    const seen = readIds()
    if (!notificationItems.length) {
      notificationList.replaceChildren(el('p', { class: 'notification-empty' }, 'Belum ada notifikasi. Notifikasi muncul saat budget hampir habis atau terlampaui.'))
      return
    }
    notificationList.replaceChildren(...notificationItems.map((item) =>
      el('div', { class: `notification-item${seen.includes(item.id) ? ' read' : ''}` },
        el('a', { href: item.href }, item.title),
        el('span', { class: 'notification-body' }, item.body))))
  }

  try {
    const sb = await getSb()
    const overview = await getBudgetOverview(sb, familyId, user.id)
    notificationItems = overview.budgets
      .filter((budget) => budget.status !== 'safe')
      .map((budget) => ({
        id: `budget-${budget.id}`,
        title: budget.status === 'danger' ? 'Budget terlampaui' : 'Budget hampir habis',
        body: `${budget.name}, ${formatRupiah(budget.spent)} dari ${formatRupiah(budget.limit)}`,
        href: '/budgets'
      }))
    const unread = notificationItems.filter((item) => !readIds().includes(item.id)).length
    badge.textContent = String(unread)
    badge.hidden = unread === 0
    renderNotifications()
  } catch {
    badge.hidden = true
    notificationList.replaceChildren(el('p', { class: 'notification-empty' }, 'Notifikasi tidak dapat dimuat. Muat ulang halaman.'))
  }
}
