function esc(s: string | number | null | undefined): string {
  const v = s == null ? '' : String(s)
  return `"${v.replace(/"/g, '""')}"`
}

/** Convierte filas de datos a CSV (BOM + CRLF para Excel). */
export function crearCsv(filas: (string | number | null | undefined)[][]): string {
  return '\uFEFF' + filas.map((f) => f.map(esc).join(',')).join('\r\n')
}

/** Descarga un archivo de texto generado en el cliente (navegador). */
export function descargarTexto(nombre: string, contenido: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}