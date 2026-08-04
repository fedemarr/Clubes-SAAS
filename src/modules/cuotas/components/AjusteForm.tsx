'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ajustarPrecio } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function aCentavos(valor: string): number {
  const s = valor.trim().replace(',', '.')
  const [i = '', d = ''] = s.split('.')
  return parseInt(i || '0', 10) * 100 + Math.round(parseInt((d || '').padEnd(2, '0').slice(0, 2), 10) || 0)
}

export function AjusteForm({ clubSlug }: { clubSlug: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onAjustar(form: FormData) {
    setError(null)
    setEnviando(true)
    const descuentos = String(form.get('descuentos') ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0)
    const result = await ajustarPrecio(clubSlug, {
      sport: String(form.get('sport') ?? ''),
      nombre: String(form.get('nombre') ?? ''),
      amountCents: aCentavos(String(form.get('amount') ?? '')),
      siblingDiscounts: descuentos.length ? descuentos : undefined,
      validFrom: String(form.get('validFrom') ?? ''),
    })
    setEnviando(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/${clubSlug}/cuotas`)
    router.refresh()
  }

  return (
    <form action={onAjustar} className="mt-6 grid max-w-md gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <p className="text-sm text-muted-foreground">
        El plan vigente de este deporte queda cerrado con vigencia hasta el día anterior a la nueva
        y se crea una versión nueva. El precio anterior nunca se pierde.
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor="sport">Deporte</Label>
        <Input id="sport" name="sport" required placeholder="rugby" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nombre">Nombre del plan nuevo</Label>
        <Input id="nombre" name="nombre" required placeholder="Cuota Rugby 2026" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="amount">Nuevo monto mensual ($)</Label>
        <Input id="amount" name="amount" required inputMode="decimal" placeholder="75000.00" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descuentos">Descuento por hermano, % (opcional)</Label>
        <Input id="descuentos" name="descuentos" placeholder="0,20,40" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="validFrom">Vigente desde</Label>
        <Input id="validFrom" name="validFrom" type="date" required />
      </div>

      <Button type="submit" disabled={enviando}>{enviando ? 'Ajustando…' : 'Ajustar precio'}</Button>
    </form>
  )
}
