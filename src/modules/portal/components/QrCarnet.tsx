'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { RefreshCw } from 'lucide-react'

const ROTACION_SEG = 30

/**
 * QR rotativo del carnet digital: cada 30s pide un token nuevo firmado
 * (JWT de 5 min) y regrafica el código. Si la sesión caduca o el rol se
 * pierde, el fetch falla y el QR desaparece.
 */
export function QrCarnet({ clubSlug }: { clubSlug: string }) {
  const [qr, setQr] = useState<string | null>(null)
  const [segundos, setSegundos] = useState(ROTACION_SEG)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function refrescar() {
      try {
        const res = await fetch(`/api/portal/carnet-token?club=${encodeURIComponent(clubSlug)}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'No se pudo generar el código')
        }
        const data = (await res.json()) as { token: string }
        const url = await QRCode.toDataURL(data.token, { width: 320, margin: 1 })
        if (activo) {
          setQr(url)
          setSegundos(ROTACION_SEG)
          setError(null)
        }
      } catch (e) {
        if (activo) {
          setQr(null)
          setError(e instanceof Error ? e.message : 'Error generando el código')
        }
      }
    }

    refrescar()
    const intervalo = setInterval(refrescar, ROTACION_SEG * 1000)
    return () => {
      activo = false
      clearInterval(intervalo)
    }
  }, [clubSlug])

  useEffect(() => {
    if (!qr) return
    const t = setInterval(() => setSegundos((s) => (s <= 0 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [qr])

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Código QR del carnet" width={320} height={320} className="size-80 rounded-lg" />
        ) : (
          <div className="flex size-80 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            {error ?? 'Generando código…'}
          </div>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className={segundos <= 5 ? 'size-3.5 animate-spin' : 'size-3.5'} />
        {qr ? `Se renueva cada 30s (próximo en ${segundos}s)` : 'Sin código'}
      </p>
    </div>
  )
}
