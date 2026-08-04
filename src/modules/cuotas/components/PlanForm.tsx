'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearPlan } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function aCentavos(valor: string): number {
  const s = valor.trim().replace(',', '.')
  const [i = '', d = ''] = s.split('.')
  return parseInt(i || '0', 10) * 100 + Math.round(parseInt((d || '').padEnd(2, '0').slice(0, 2), 10) || 0)
}

export function PlanForm({ clubSlug }: { clubSlug: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onCrear(form: FormData) {
    setError(null)
    setEnviando(true)
    const descuentos = String(form.get('descuentos') ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0)
    const result = await crearPlan(clubSlug, {
      name: String(form.get('name') ?? ''),
      sport: form.get('sport') ? String(form.get('sport')) : null,
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
    <form action={onCrear} className="mt-6 grid max-w-md gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required placeholder="Cuota Rugby" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="sport">Deporte (opcional)</Label>
        <Input id="sport" name="sport" placeholder="rugby — dejar vacío para cuota social" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="amount">Monto mensual ($)</Label>
        <Input id="amount" name="amount" required inputMode="decimal" placeholder="65000.00" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descuentos">Descuento por hermano, % (opcional)</Label>
        <Input id="descuentos" name="descuentos" placeholder="0,20,40" />
        <p className="text-xs text-muted-foreground">
          0,20,40 = 1º hermano 0%, 2º 20%, 3º 40%. Los descuentos caen sobre las cuotas más baratas.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="validFrom">Vigente desde</Label>
        <Input id="validFrom" name="validFrom" type="date" required />
      </div>

      <Button type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Crear plan'}</Button>
    </form>
  )
}
