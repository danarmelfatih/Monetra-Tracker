const THEME_KEY = 'monetra-theme'

export function readTheme() {
  let stored = null
  try {
    stored = localStorage.getItem(THEME_KEY)
  } catch {}
  if (stored === 'dark' || stored === 'light') return stored
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = value
  return value
}

export function setTheme(theme) {
  const value = applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, value)
  } catch {}
  return value
}

export function toggleTheme() {
  return setTheme(readTheme() === 'dark' ? 'light' : 'dark')
}
