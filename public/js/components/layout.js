import { el } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { signOut, getMyFamilies, setActiveFamily } from '../lib/auth.js'
import { getSb } from '../lib/supabase.js'
import { getBudgetOverview } from '../lib/budget.js'
import { getNotifications, markNotificationRead, markNotificationsRead, deleteNotification } from '../lib/notifications.js'
import { applyTheme, readTheme, toggleTheme } from '../lib/theme.js'
import { formatRupiah } from '../lib/format.js'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/transactions', label: 'Transaksi', icon: 'receipt' },
  { href: '/budgets', label: 'Anggaran', icon: 'budget' },
  { href: '/reports', label: 'Laporan', icon: 'report' },
  { href: '/wallets', label: 'Dompet', icon: 'wallet' },
  { href: '/categories', label: 'Kategori', icon: 'grid' },
  { href: '/family/members', label: 'Anggota', icon: 'team' },
  { href: '/savings', label: 'Tabungan', icon: 'wallet' }
]

const MORE_LINKS = [
  NAV[2], NAV[5], NAV[3], NAV[6], NAV[7]
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

export async function renderLayout({ user, familyName, activePath, familyId, greeting = false, guest = false }) {
  applyTheme(readTheme())
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  }

  const familyLabel = guest ? 'Mode Tamu' : cleanText(familyName, 'Keluarga')
  const userName = guest ? 'Tamu' : cleanText(user.user_metadata?.full_name, cleanText(user.email, 'Anggota'))
  const userEmail = guest ? '' : cleanText(user.email, '')
  const initial = guest ? 'T' : userName.charAt(0).toUpperCase()

  const isActive = (href) => href === activePath
  const sidebarLink = (n) => el('a', {
    href: n.href,
    class: isActive(n.href) ? 'active' : '',
    'aria-current': isActive(n.href) ? 'page' : null
  }, icon(n.icon), el('span', {}, n.label))

  const sidebarUser = guest
    ? el('div', { class: 'sidebar-user' },
      el('span', { class: 'sidebar-avatar', 'aria-hidden': 'true' }, initial),
      el('div', { class: 'sidebar-user-copy' },
        el('span', { class: 'sidebar-user-name' }, userName),
        el('span', { class: 'sidebar-user-family' }, 'Data tidak ditampilkan')),
      el('a', { class: 'btn btn-ghost sidebar-logout', href: '/login' }, 'Masuk'))
    : el('div', { class: 'sidebar-user' },
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

  let currentTheme = readTheme()
  const themeButton = el('button', {
    class: 'icon-button theme-toggle',
    type: 'button',
    'aria-label': currentTheme === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap',
    'aria-pressed': String(currentTheme === 'dark'),
    onclick: () => {
      currentTheme = toggleTheme()
      updateThemeButton(currentTheme)
    }
  }, icon(currentTheme === 'dark' ? 'sun' : 'moon'))

  const updateThemeButton = (value) => {
    themeButton.replaceChildren(icon(value === 'dark' ? 'sun' : 'moon'))
    themeButton.setAttribute('aria-label', value === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap')
    themeButton.setAttribute('aria-pressed', String(value === 'dark'))
  }

  const notificationList = el('div', { class: 'notification-list' },
    el('p', { class: 'notification-empty' }, 'Memuat notifikasi keluarga...'))
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

  let sb = null
  const notificationUserId = guest ? 'guest' : user.id
  const readKey = `notifications-read:${notificationUserId}`
  const seenKey = `notifications-seen:${notificationUserId}`
  let notificationItems = []

  const readIds = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(readKey) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  }

  const seenStamps = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(seenKey) || '{}')
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    } catch {
      return {}
    }
  }

  const saveSeenStamps = (stamps) => {
    try {
      localStorage.setItem(seenKey, JSON.stringify(stamps))
    } catch {}
  }

  const isFreshStamp = (stamp) => {
    const time = Date.parse(stamp)
    return Number.isFinite(time) && Date.now() - time < 24 * 60 * 60 * 1000
  }

  const visibleItems = () => notificationItems.filter((item) => !readIds().includes(item.id))

  const buildBudgetItems = (budgets) => {
    const current = budgets
      .filter((budget) => budget.status !== 'safe')
      .map((budget) => ({
        id: `budget-${budget.id}`,
        source: 'budget',
        title: budget.status === 'danger' ? 'Budget terlampaui' : 'Budget hampir habis',
        body: `${cleanText(budget.name, 'Anggaran')}, ${formatRupiah(Number.isFinite(Number(budget.spent)) ? Number(budget.spent) : 0)} dari ${formatRupiah(Number.isFinite(Number(budget.limit)) ? Number(budget.limit) : 0)}`,
        href: '/budgets'
      }))
    const stamps = seenStamps()
    const now = new Date().toISOString()
    const currentIds = new Set(current.map((item) => item.id))
    let changed = false
    for (const id of Object.keys(stamps)) {
      if (!currentIds.has(id)) {
        delete stamps[id]
        changed = true
      }
    }
    const read = readIds()
    const nextRead = read.filter((id) => !id.startsWith('budget-') || currentIds.has(id))
    if (nextRead.length !== read.length) {
      try {
        localStorage.setItem(readKey, JSON.stringify(nextRead))
      } catch {}
    }
    const fresh = current.filter((item) => {
      if (!stamps[item.id]) {
        stamps[item.id] = now
        changed = true
        return true
      }
      return isFreshStamp(stamps[item.id])
    })
    if (changed) saveSeenStamps(stamps)
    return fresh
  }

  const updateBadge = () => {
    const unread = visibleItems().length
    badge.textContent = String(unread)
    badge.hidden = unread === 0
  }

  const markItemRead = async (item) => {
    try {
      localStorage.setItem(readKey, JSON.stringify([...new Set([...readIds(), item.id])]))
    } catch {}
    if (item.source === 'db' && sb) {
      try {
        await markNotificationRead(sb, item.dbId)
      } catch {}
    }
  }

  const dismissNotification = async (item) => {
    if (item.source === 'db' && sb) {
      try {
        await deleteNotification(sb, item.dbId)
      } catch {
        return
      }
    }
    notificationItems = notificationItems.filter((n) => n.id !== item.id)
    renderNotifications()
    updateBadge()
  }

  const openNotification = async (item) => {
    await markItemRead(item)
    notificationItems = notificationItems.filter((n) => n.id !== item.id)
    renderNotifications()
    updateBadge()
    if (item.href) location.assign(item.href)
  }

  const renderNotifications = () => {
    const items = visibleItems()
    if (!items.length) {
      notificationList.replaceChildren(el('p', { class: 'notification-empty' }, 'Belum ada notifikasi baru. Notifikasi hilang otomatis setelah 24 jam.'))
      return
    }
    notificationList.replaceChildren(...items.map((item) => {
      const content = el('div', { class: 'notification-copy' },
        item.href
          ? el('a', {
            href: item.href,
            onclick: (event) => {
              event.preventDefault()
              openNotification(item)
            }
          }, item.title)
          : el('strong', {}, item.title),
        el('span', { class: 'notification-body' }, item.body))
      return el('div', { class: 'notification-item' }, content,
        el('button', {
          class: 'notification-dismiss',
          type: 'button',
          'aria-label': `Hapus notifikasi ${item.title}`,
          onclick: () => dismissNotification(item)
        }, 'Hapus'))
    }))
  }

  notificationButton.addEventListener('click', () => {
    const open = notificationPanel.hidden
    setPanel(notificationPanel, notificationButton, open)
    if (open) {
      setPanel(profilePanel, profileButton, false)
      morePanel.hidden = true
      moreButton.setAttribute('aria-expanded', 'false')
      const items = visibleItems()
      if (items.length) {
        try {
          localStorage.setItem(readKey, JSON.stringify([...new Set([...readIds(), ...items.map((item) => item.id)])]))
        } catch {}
        const dbIds = items.filter((item) => item.source === 'db').map((item) => item.dbId)
        if (dbIds.length && sb) markNotificationsRead(sb, dbIds).catch(() => {})
        const ids = new Set(items.map((item) => item.id))
        notificationItems = notificationItems.filter((item) => !ids.has(item.id))
        renderNotifications()
        updateBadge()
      }
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
  if (!guest) {
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
  }

  const headerTitle = guest
    ? el('div', { class: 'header-title' },
      el('span', { class: 'header-greeting' }, 'Mode Tamu'),
      el('h1', {}, 'Dashboard'))
    : greeting
      ? el('div', { class: 'header-title' },
        el('span', { class: 'header-greeting' }, greetingFor(userName)),
        el('h1', {}, 'Dashboard'))
      : el('strong', { class: 'header-family' }, familyLabel)

  const header = document.getElementById('header')
  header.replaceChildren(
    headerTitle,
    switcher,
    el('div', { class: 'header-actions' },
      themeButton,
      guest
        ? el('a', { class: 'btn btn-ghost', href: '/login' }, 'Masuk')
        : el('div', { class: 'notification-wrap' }, notificationButton, notificationPanel),
      guest ? null : el('div', { class: 'header-profile' }, profileButton, profilePanel))
  )
  stripNullText(header)

  if (!guest) {
    try {
      sb = await getSb()
      const [budgetResult, storedResult] = await Promise.allSettled([
        getBudgetOverview(sb, familyId, user.id),
        getNotifications(sb, familyId, user.id)
      ])

      let budgetItems = []
      let storedItems = []
      let failed = 0

      if (budgetResult.status === 'fulfilled') {
        budgetItems = buildBudgetItems(budgetResult.value.budgets)
      } else {
        failed += 1
      }

      if (storedResult.status === 'fulfilled') {
        storedItems = storedResult.value.map((item) => ({
          id: `db-${item.id}`,
          source: 'db',
          dbId: item.id,
          title: cleanText(item.title, 'Notifikasi'),
          body: cleanText(item.body, ''),
          href: item.href || null
        }))
      } else {
        failed += 1
      }

      notificationItems = [...storedItems, ...budgetItems]
      if (!notificationItems.length && failed === 2) {
        badge.hidden = true
        notificationList.replaceChildren(el('p', { class: 'notification-empty' }, 'Notifikasi tidak dapat dimuat. Muat ulang halaman.'))
      } else {
        updateBadge()
        renderNotifications()
      }
    } catch {
      badge.hidden = true
      notificationList.replaceChildren(el('p', { class: 'notification-empty' }, 'Notifikasi tidak dapat dimuat. Muat ulang halaman.'))
    }
  }
}
