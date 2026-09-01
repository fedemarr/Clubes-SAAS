import * as XLSX from 'xlsx'

/**
 * Armado de Excel multi-sheet (M11) sin dependencias de estilo:
 * `xlsx` (SheetJS CE) no pinta celdas con colores de club — se prescinde
 * por ahora y se compensa con filas de encabezado (club, fecha, exportador),
 * ancho de columnas y formato de moneda ARS vía número `z`.
 */

export type HojaExcel = {
  nombre: string
  encabezados: string[]
  filas: (string | number | null | undefined)[][]
  /** Columnas 0-based con formato moneda ARS ("$ #,##0.00"). El valor ya viaja en pesos. */
  dineroCols?: number[]
}

export type DatosWorkbook = {
  clubName: string
  titulo: string
  exportador: string
  fecha: Date
  hojas: HojaExcel[]
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

export function fmtFechaHora(d: Date): string {
  const fecha = fmtFecha(d.toISOString())
  const hora = d.toISOString().slice(11, 16)
  return `${fecha} ${hora}`
}

export function buildWorkbook(d: DatosWorkbook): Buffer {
  const wb = XLSX.utils.book_new()

  for (const hoja of d.hojas) {
    const aoa: (string | number)[][] = [
      [d.clubName],
      [`${d.titulo} · Exportado el ${fmtFechaHora(d.fecha)} por ${d.exportador}`],
      [],
      hoja.encabezados,
      ...hoja.filas.map((f) => f as (string | number)[]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = hoja.encabezados.map(() => ({ wch: 22 }))

    if (hoja.dineroCols) {
      for (let r = 3; r < aoa.length; r++) {
        for (const c of hoja.dineroCols) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell && typeof cell.v === 'number') cell.z = '"$" #,##0.00'
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31))
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}