const PATHS = {
  home: [
    'M3 11.5 12 4l9 7.5',
    'M5 10v10h14V10',
    'M9 20v-6h6v6'
  ],
  receipt: [
    'M6 3h12v18l-3-2-3 2-3-2-3 2V3Z',
    'M9 8h6',
    'M9 12h6',
    'M9 16h4'
  ],
  wallet: [
    'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z',
    'M3 7V5a2 2 0 0 1 2-2h11',
    'M17.2 13a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0'
  ],
  budget: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
    'M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0'
  ],
  report: [
    'M4 20V10',
    'M10 20V4',
    'M16 20v-7',
    'M22 20H2'
  ],
  team: [
    'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    'M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
    'M18 6.5a3 3 0 0 1 0 5',
    'M19 14c1.8.7 3 2.2 3 4'
  ],
  income: [
    'M19 5 7 17',
    'M7 17h8',
    'M7 17V9'
  ],
  expense: [
    'M5 19 17 7',
    'M17 7H9',
    'M17 7v8'
  ],
  plus: [
    'M12 5v14',
    'M5 12h14'
  ],
  grid: [
    'M4 4h7v7H4z',
    'M13 4h7v7h-7z',
    'M4 13h7v7H4z',
    'M13 13h7v7h-7z'
  ],
  bell: [
    'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9',
    'M10 21h4'
  ],
  offline: [
    'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11-2 4 4 0 0 0 1 10Z',
    'M3 3l18 18'
  ]
}

export function icon(name, className = '') {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const paths = PATHS[name] || PATHS.grid
  svg.setAttribute('class', `icon ${className}`.trim())
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
