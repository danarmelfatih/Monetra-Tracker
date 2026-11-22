import { icon } from '../lib/icons.js'
import { applyHideAmounts, readHideAmounts, toggleHideAmounts } from '../lib/privacy.js'

export function initPrivacyToggle() {
  const button = document.getElementById('btn-hide-amounts')
  if (!button || button.dataset.ready === 'true') return
  button.dataset.ready = 'true'
  applyHideAmounts(readHideAmounts())
  let hidden = readHideAmounts()
  const label = () => hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal'
  const update = () => {
    button.querySelector('.privacy-icon')?.replaceChildren(icon(hidden ? 'eyeOff' : 'eye'))
    const text = button.querySelector('.privacy-label')
    if (text) text.textContent = hidden ? 'Tampilkan' : 'Sembunyikan'
    button.setAttribute('aria-label', label())
    button.setAttribute('title', label())
    button.setAttribute('aria-pressed', String(hidden))
  }
  button.addEventListener('click', () => {
    hidden = toggleHideAmounts()
    update()
  })
  update()
}
