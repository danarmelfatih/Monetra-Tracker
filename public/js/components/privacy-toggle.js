import { el } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { applyHideAmounts, readHideAmounts, toggleHideAmounts } from '../lib/privacy.js'

export function privacyToggleButton() {
  applyHideAmounts(readHideAmounts())
  let hidden = readHideAmounts()
  const label = () => hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal'
  const button = el('button', {
    class: 'btn btn-ghost privacy-toggle',
    id: 'btn-hide-amounts',
    type: 'button',
    onclick: () => {
      hidden = toggleHideAmounts()
      update()
    }
  })
  const update = () => {
    button.replaceChildren(icon(hidden ? 'eyeOff' : 'eye'), el('span', {}, hidden ? 'Tampilkan' : 'Sembunyikan'))
    button.setAttribute('aria-label', label())
    button.setAttribute('title', label())
    button.setAttribute('aria-pressed', String(hidden))
  }
  update()
  return button
}
