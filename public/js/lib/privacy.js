const HIDE_KEY = 'monetra-hide-amounts'

export function readHideAmounts() {
  try {
    return localStorage.getItem(HIDE_KEY) === 'true'
  } catch {
    return false
  }
}

export function applyHideAmounts(hidden) {
  const value = Boolean(hidden)
  document.documentElement.dataset.hideAmounts = value ? 'true' : 'false'
  return value
}

export function setHideAmounts(hidden) {
  const value = applyHideAmounts(hidden)
  try {
    localStorage.setItem(HIDE_KEY, value ? 'true' : 'false')
  } catch {}
  return value
}

export function toggleHideAmounts() {
  return setHideAmounts(!readHideAmounts())
}
