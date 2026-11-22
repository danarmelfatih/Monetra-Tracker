const toggle = document.getElementById('nav-toggle')
const menu = document.getElementById('mobile-menu')

function closeMenu() {
  menu.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-label', 'Buka menu')
}

toggle.addEventListener('click', () => {
  const open = menu.hidden
  menu.hidden = !open
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu')
})

menu.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu()
})

document.addEventListener('click', (event) => {
  if (!menu.hidden && !event.target.closest('.nav-wrap')) closeMenu()
})
