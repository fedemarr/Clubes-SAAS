'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ajustarCuenta } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function aCentavos(valor: string): number {
  const s = valor.trim().replace(',', '.')
  const [i = '', d = ''] = s.split('.')
  return parseInt(i || '0', 10) * 100 + Math.round(parseInt((d || '').padEnd(2, '0').slice(0, 2), 10) || 0)
}

export function AjusteCuentaForm({
  clubSlug,
  accountId,
}: {
  clubSlug: string
  accountId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [direccion, setDireccion] = useState<'debito' | 'credito'>('credito')

  async function onAjustar(form: FormData) {
    setError(null)
    setEnviando(true)
    const r = await ajustarCuenta(clubSlug, {
      accountId,
      direccion,
      montoCents: aCentavos(String(form.get('monto') ?? '')),
      motivo: String(form.get('motivo') ?? ''),
    })
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    router.refresh()
  }

  return (
    <form action={onAjustar} className="mt-3 flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="ajuste-direccion">Tipo</Label>
        <Select required value={direccion} onValueChange={(v) => setDireccion(v as 'debito' | 'credito')}>
          <SelectTrigger id="ajuste-direccion" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="credito">Nota de crédito</SelectItem>
            <SelectItem value="debito">Débito</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ajuste-monto">Monto ($)</Label>
        <Input id="ajuste-monto" name="monto" required inputMode="decimal" placeholder="5000.00" className="w-36" />
      </div>
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="ajuste-motivo">Motivo (obligatorio)</Label>
        <Input id="ajuste-motivo" name="motivo" required minLength={5} placeholder="Ej: descuento por lesión" />
      </div>
      <Button type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar ajuste'}</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  )
}
