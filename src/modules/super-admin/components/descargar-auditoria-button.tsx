'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportarAuditoriaCsv } from '../actions'
import { descargarTexto } from '@/lib/csv'
import { Button } from '@/components/ui/button'

export function DescargarAuditoriaCsvButton() {
  const [trabajando, setTrabajando] = useState(false)

  async function descargar() {
    setTrabajando(true)
    try {
      const r = await exportarAuditoriaCsv()
      if (r.ok) descargarTexto(`auditoria_super_admin_${new Date().toISOString().slice(0, 10)}.csv`, r.data)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={descargar} disabled={trabajando}>
      <Download className="size-3.5" />
      {trabajando ? 'Generando…' : 'Descargar CSV'}
    </Button>
  )
}