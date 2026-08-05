'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { borrarDocumento } from '../actions'
import { Button } from '@/components/ui/button'

export function BorrarDocumentoButton({ clubSlug, documentId }: { clubSlug: string; documentId: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function borrar() {
    setError(null)
    setSubmitting(true)
    const r = await borrarDocumento(clubSlug, { documentId })
    setSubmitting(false)
    if (!r.ok) return setError(r.error)
    router.refresh()
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={() => void borrar()} disabled={submitting}>
          Borrar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={submitting}>
          Cancelar
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
      <Trash2 data-icon="inline-start" />
      Borrar
    </Button>
  )
}
