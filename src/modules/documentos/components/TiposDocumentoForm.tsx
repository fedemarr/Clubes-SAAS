'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Save } from 'lucide-react'
import { guardarTipoDocumento } from '../actions'
import type { TipoDocumento } from '../queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const KIND_LABELS: Record<string, string> = {
  apto_medico: 'Apto médico',
  dni: 'DNI',
  consentimiento_imagen: 'Consentimiento de imagen',
  consentimiento_tutor: 'Consentimiento del tutor',
  seguro: 'Seguro',
  ficha_federativa: 'Ficha federativa',
  otro: 'Otro',
}

export function TiposDocumentoForm({ clubSlug, tipos }: { clubSlug: string; tipos: TipoDocumento[] }) {
  const router = useRouter()

  return (
    <div className="space-y-3">
      {tipos.map((tipo) => (
        <TipoRow key={tipo.kind} clubSlug={clubSlug} tipo={tipo} onGuardado={() => router.refresh()} />
      ))}
    </div>
  )
}

function TipoRow({
  clubSlug,
  tipo,
  onGuardado,
}: {
  clubSlug: string
  tipo: TipoDocumento
  onGuardado: () => void
}) {
  const [label, setLabel] = useState(tipo.label)
  const [requiresExpiry, setRequiresExpiry] = useState(tipo.requiresExpiry)
  const [alertDays, setAlertDays] = useState(tipo.alertDays.join(', '))
  const [enabled, setEnabled] = useState(tipo.enabled)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function guardar() {
    setError(null)
    const dias = alertDays
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365)
    setSubmitting(true)
    const r = await guardarTipoDocumento(clubSlug, {
      id: tipo.id,
      kind: tipo.kind,
      label,
      requiresExpiry,
      alertDays: dias,
      enabled,
    })
    setSubmitting(false)
    if (!r.ok) return setError(r.error)
    onGuardado()
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={enabled ? 'default' : 'outline'}>{KIND_LABELS[tipo.kind] ?? tipo.kind}</Badge>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 accent-primary"
            aria-label={`Habilitar ${tipo.kind}`}
          />
          <span className="text-xs text-muted-foreground">Habilitado</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void guardar()} disabled={submitting}>
          <Save data-icon="inline-start" />
          Guardar
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`label-${tipo.kind}`}>Nombre visible</Label>
          <Input id={`label-${tipo.kind}`} value={label} onChange={(e) => setLabel(e.target.value)} className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`venc-${tipo.kind}`}>
            <input
              type="checkbox"
              checked={requiresExpiry}
              onChange={(e) => setRequiresExpiry(e.target.checked)}
              className="mr-1.5 size-3.5 align-middle accent-primary"
            />
            Requiere vencimiento
          </Label>
          <p className="text-xs text-muted-foreground">Avisos de renovación a tiempo.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`dias-${tipo.kind}`}>Días de aviso</Label>
          <Input
            id={`dias-${tipo.kind}`}
            value={alertDays}
            onChange={(e) => setAlertDays(e.target.value)}
            placeholder="30, 15, 3"
            disabled={!requiresExpiry}
            className="h-8"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
