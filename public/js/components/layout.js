import { el } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { signOut, getMyFamilies, setActiveFamily } from '../lib/auth.js'
import { getSb } from '../lib/supabase.js'
import { getBudgetOverview } from '../lib/budget.js'
import { formatRupiah } from '../lib/format.js'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/transactions', label: 'Transaksi', icon: 'receipt' },
  { href: '/budgets', label: 'Anggaran', icon: 'budget' },
  { href: '/reports', label: 'Laporan', icon: 'report' },
  { href: '/wallets', label: 'Dompet', icon: 'wallet' },
  { href: '/categories', label: 'Kategori', icon: 'grid' },
  { href: '/family/members', label: 'Anggota', icon: 'team' }
]

const MORE_LINKS = [
  NAV[2], NAV[5], NAV[3], NAV[6]
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

const greetingFor = (name) => {
  const hour = new Date().getHours()
  const part = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam'
  const first = name.split(/\s+/)[0] || 'Anggota'
  return `Selamat ${part}, ${first}!`
}

export async function renderLayout({ user, familyName, activePath, familyId, greeting = false }) {
  const familyLabel = cleanText(familyName, 'Keluarga')
  const userName = cleanText(user.user_metadata?.full_name, cleanText(user.email, 'Anggota'))
  const userEmail = cleanText(user.email, '')
  const initial = userName.charAt(0).toUpperCase()

  const isActive = (href) => href === activePath
  const sidebarLink = (n) => el('a', {
    href: n.href,
    class: isActive(n.href) ? 'active' : '',
    'aria-current': isActive(n.href) ? 'page' : null
  }, icon(n.icon), el('span', {}, n.label))

  const sidebarUser = el('div', { class: 'sidebar-user' },
    el('span', { class: 'sidebar-avatar', 'aria-hidden': 'true' }, initial),
    el('div', { class: 'sidebar-user-copy' },
      el('span', { class: 'sidebar-user-name' }, userName),
      el('span', { class: 'sidebar-user-family' }, familyLabel)),
    el('button', { class: 'btn btn-ghost sidebar-logout', onclick: signOut }, 'Keluar'))

  document.getElementById('sidebar')
    .replaceChildren(
      el('a', { class: 'brand', href: '/dashboard' },
        el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'M'),
        el('span', {}, 'Monetra Tracker')),
      el('div', { class: 'nav-label' }, 'MENU UTAMA'),
      ...NAV.map(sidebarLink),
      sidebarUser
    )

  const moreActive = MORE_LINKS.some((n) => isActive(n.href))
  const tabLink = (n, className = '', attrs = {}) => el('a', {
    href: n.href,
    class: `tab-button ${className}${isActive(n.href) ? ' active' : ''}`.trim(),
    'aria-current': isActive(n.href) ? 'page' : null,
    ...attrs
  }, icon(n.icon), el('span', {}, n.label))

  const morePanel = el('div', { class: 'more-sheet', id: 'more-sheet', hidden: true },
    el('div', { class: 'more-sheet-head' }, el('strong', {}, 'Menu lainnya')),
    ...MORE_LINKS.map((n) => el('a', { href: n.href }, icon(n.icon), el('span', {}, n.label))))

  const moreButton = el('button', {
    class: `tab-button${moreActive ? ' active' : ''}`,
    type: 'button',
    'aria-label': 'Lainnya',
    'aria-expanded': 'false',
    'aria-controls': 'more-sheet',
    onclick: () => {
      const open = morePanel.hidden
      morePanel.hidden = !open
      moreButton.setAttribute('aria-expanded', String(open))
      if (open) {
        setPanel(profilePanel, profileButton, false)
        setPanel(notificationPanel, notificationButton, false)
      }
    }
  }, icon('grid'), el('span', {}, 'Lainnya'))

  document.getElementById('bottomnav')
    .replaceChildren(
      tabLink(NAV[0]),
      tabLink(NAV[1]),
      tabLink({ href: '/transactions?new=1', label: 'Tambah', icon: 'plus' }, 'tab-add', { 'aria-label': 'Tambah transaksi' }),
      tabLink(NAV[4]),
      moreButton,
      morePanel
    )

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
  }, icon('bell'), badge)

  const profilePanel = el('div', { class: 'profile-panel', id: 'profile-panel', hidden: true },
    el('strong', {}, userName),
    userEmail ? el('span', { class: 'muted' }, userEmail) : null,
    el('span', { class: 'muted' }, familyLabel),
    el('a', { href: '/family/members' }, 'Lihat anggota keluarga'),
    el('button', { class: 'btn btn-ghost profile-logout', onclick: signOut }, 'Keluar'))

  const profileButton = el('button', {
    class: 'profile-button', type: 'button', 'aria-label': 'Profil',
    'aria-expanded': 'false', 'aria-controls': 'profile-panel',
    onclick: () => {
      const open = profilePanel.hidden
      setPanel(profilePanel, profileButton, open)
      if (open) {
        setPanel(notificationPanel, notificationButton, false)
        morePanel.hidden = true
        moreButton.setAttribute('aria-expanded', 'false')
      }
    }
  }, el('span', { class: 'avatar', 'aria-hidden': 'true' }, initial), el('span', {}, 'Profil'))

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

  notificationButton.addEventListener('click', () => {
    const open = notificationPanel.hidden
    setPanel(notificationPanel, notificationButton, open)
    if (open) {
      setPanel(profilePanel, profileButton, false)
      morePanel.hidden = true
      moreButton.setAttribute('aria-expanded', 'false')
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
    if (!morePanel.hidden && !morePanel.contains(event.target) && !moreButton.contains(event.target)) {
      morePanel.hidden = true
      moreButton.setAttribute('aria-expanded', 'false')
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    setPanel(profilePanel, profileButton, false)
    setPanel(notificationPanel, notificationButton, false)
    morePanel.hidden = true
    moreButton.setAttribute('aria-expanded', 'false')
  })

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

  const headerTitle = greeting
    ? el('div', { class: 'header-title' },
      el('span', { class: 'header-greeting' }, greetingFor(userName)),
      el('h1', {}, 'Dashboard'))
    : el('strong', { class: 'header-family' }, familyLabel)

  const header = document.getElementById('header')
  header.replaceChildren(
    headerTitle,
    switcher,
    el('div', { class: 'header-actions' },
      el('div', { class: 'notification-wrap' }, notificationButton, notificationPanel),
      el('div', { class: 'header-profile' }, profileButton, profilePanel))
  )
  stripNullText(header)

  try {
    const sb = await getSb()
    const overview = await getBudgetOverview(sb, familyId, user.id)
    notificationItems = overview.budgets
      .filter((budget) => budget.status !== 'safe')
      .map((budget) => ({
        id: `budget-${budget.id}`,
        title: budget.status === 'danger' ? 'Budget terlampaui' : 'Budget hampir habis',
        body: `${cleanText(budget.name, 'Anggaran')}, ${formatRupiah(Number.isFinite(Number(budget.spent)) ? Number(budget.spent) : 0)} dari ${formatRupiah(Number.isFinite(Number(budget.limit)) ? Number(budget.limit) : 0)}`,
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
