'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { anularCargo } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AnularCargoForm({ clubSlug, cargoId }: { clubSlug: string; cargoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onAnular(form: FormData) {
    setError(null)
    setEnviando(true)
    const r = await anularCargo(clubSlug, {
      cargoId,
      motivo: String(form.get('motivo') ?? ''),
    })
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        Anular
      </Button>
    )
  }

  return (
    <form action={onAnular} className="flex items-center gap-2">
      <Input
        name="motivo"
        placeholder="Motivo de la anulación"
        required
        minLength={5}
        className="h-8 w-56"
        autoFocus
      />
      <Button type="submit" size="sm" variant="destructive" disabled={enviando}>
        {enviando ? '…' : 'Confirmar'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  )
}
