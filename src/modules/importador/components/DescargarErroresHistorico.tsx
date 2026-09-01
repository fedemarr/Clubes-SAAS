'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { filasErrorBatch, type FilaErrorBatch } from '../actions'
import { crearCsv, descargarTexto } from '@/lib/csv'
import { Button } from '@/components/ui/button'

export function aCsvErrores(rows: FilaErrorBatch[]): string {
  return crearCsv([['nro_fila', 'estado', 'errores'], ...rows.map((r) => [r.index + 1, r.estado, r.errores.join('; ')])])
}

export function descargarCsv(nombre: string, contenido: string) {
  descargarTexto(nombre, contenido)
}

/** Descarga el CSV de errores de un batch del historial (ya persistido). */
export function DescargarErroresHistorico({ clubSlug, batchId }: { clubSlug: string; batchId: string }) {
  const [trabajando, setTrabajando] = useState(false)

  async function descargar() {
    setTrabajando(true)
    const r = await filasErrorBatch(clubSlug, { batchId })
    setTrabajando(false)
    if (!r.ok) return
    descargarCsv(`errores_${batchId.slice(0, 8)}.csv`, aCsvErrores(r.data.filter((f) => f.estado === 'error')))
  }

  return (
    <Button variant="outline" size="sm" onClick={descargar} disabled={trabajando}>
      <Download className="size-3.5" />
      {trabajando ? 'Generando…' : 'CSV de errores'}
    </Button>
  )
}