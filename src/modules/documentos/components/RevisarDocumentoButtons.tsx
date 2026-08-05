'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { revisarDocumento } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function RevisarDocumentoButtons({ clubSlug, documentId }: { clubSlug: string; documentId: string }) {
  const router = useRouter()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function aprobar() {
    setError(null)
    setSubmitting(true)
    const r = await revisarDocumento(clubSlug, { documentId, aprobar: true })
    setSubmitting(false)
    if (!r.ok) return setError(r.error)
    router.refresh()
  }

  async function rechazar() {
    setError(null)
    setSubmitting(true)
    const r = await revisarDocumento(clubSlug, { documentId, aprobar: false, rejectionReason: motivo })
    setSubmitting(false)
    if (!r.ok) return setError(r.error)
    router.refresh()
  }

  if (rechazando) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void rechazar()
        }}
      >
        <Input
          autoFocus
          placeholder="Motivo del rechazo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="h-8 w-52"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={submitting || !motivo.trim()}>
          Rechazar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRechazando(false)} disabled={submitting}>
          <X className="size-4" />
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => void aprobar()} disabled={submitting}>
        <Check data-icon="inline-start" />
        Aprobar
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRechazando(true)} disabled={submitting}>
        <X data-icon="inline-start" />
        Rechazar
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
