import type { CSSProperties } from 'react'

/**
 * Deriva las variables de tema de shadcn a partir del color de marca del club
 * (clubs.branding.primary). El color de primer plano se elige por luminancia
 * relativa para garantizar contraste sin depender del club. Se aplica como
 * CSS vars sobre el subárbol del tenant (regla 2: nada hardcodeado — el
 * color sale de la base, no del código).
 */
export function brandTokens(hex: string): CSSProperties {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const fg = luminance > 0.6 ? '#0f172a' : '#ffffff'

  return {
    '--brand-primary': hex,
    '--primary': hex,
    '--primary-foreground': fg,
    '--ring': hex,
    '--accent': `color-mix(in oklab, ${hex} 10%, white)`,
    '--accent-foreground': fg,
    '--sidebar-primary': hex,
    '--sidebar-primary-foreground': fg,
    '--sidebar-accent': `color-mix(in oklab, ${hex} 8%, white)`,
    '--sidebar-accent-foreground': fg,
    '--sidebar-ring': hex,
  } as CSSProperties
}
