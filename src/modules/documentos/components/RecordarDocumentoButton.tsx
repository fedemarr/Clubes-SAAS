'use client'

import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { recordarDocumento } from '../actions'
import { Button } from '@/components/ui/button'

/** Re-notifica al dueño de un documento pendiente/vencido (M15). */
export function RecordarDocumentoButton({ clubSlug, documentId }: { clubSlug: string; documentId: string }) {
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({})

  async function onClick() {
    setState({})
    const res = await recordarDocumento(clubSlug, { documentId })
    if (!res.ok) {
      setState({ error: res.error })
      return
    }
    setState({ ok: true })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void onClick()}>
        <BellRing className="size-3.5" />
        Recordar
      </Button>
      {state.ok && <span className="text-xs text-green-700">Enviado</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </span>
  )
}