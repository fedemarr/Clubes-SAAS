/**
 * Regla 7 del brief: nunca float para plata. La base guarda numeric(14,2)
 * (string en Drizzle) y el código trabaja con enteros de centavos. Estos dos
 * helpers son el único punto de conversión entre ambos mundos.
 */

/** "65000.00" o 65000 → 6500000 centavos. Entero, sin floats en el medio. */
export function decimalToCents(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(2) : value
  const negative = s.trim().startsWith('-')
  const clean = s.trim().replace(/^-/, '')
  const [intPart = '', decPart = ''] = clean.split('.')
  const cents = Math.round(parseInt(decPart.padEnd(2, '0').slice(0, 2) || '0', 10))
  const total = parseInt(intPart || '0', 10) * 100 + cents
  return negative ? -total : total
}

/** 6500000 centavos → "65000.00". Listo para numeric(14,2). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const int = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  return `${sign}${int}.${dec}`
}

export function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(cents / 100)
}
