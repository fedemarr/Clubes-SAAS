'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Url = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Url)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

type Estado = 'desactivado' | 'activando' | 'activado' | 'error'

/**
 * Activa las notificaciones push del navegador para el club (M6). Registra
 * el SW si hace falta (idempotente), pide permiso y guarda la suscripción
 * en el server. El toggle apaga y borra la suscripción del server.
 */
export function PushSubscribeCard({ clubSlug }: { clubSlug: string }) {
  const [estado, setEstado] = useState<Estado>('desactivado')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const soportado =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  useEffect(() => {
    if (!soportado) return
    let activo = true
    async function leerEstado() {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (activo) setEstado(sub ? 'activado' : 'desactivado')
      } catch {
        // El SW puede no estar listo todavía; se resuelve al subscribir.
      }
    }
    void leerEstado()
    return () => {
      activo = false
    }
  }, [soportado])

  const activar = useCallback(async () => {
    setEstado('activando')
    setMensaje(null)
    try {
      if (!VAPID_PUBLIC_KEY) {
        setMensaje('El club todavía no activó las notificaciones push en su configuración.')
        setEstado('error')
        return
      }
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setMensaje('Necesitás habilitar las notificaciones del navegador para recibir avisos.')
        setEstado('error')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const suscripcion = sub ?? (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

      const res = await fetch(`/api/portal/push/register?club=${encodeURIComponent(clubSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: suscripcion.endpoint, keys: suscripcion.toJSON() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'No se pudo guardar la suscripción')
      }
      setEstado('activado')
      setMensaje(null)
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudieron activar las notificaciones.')
      setEstado('error')
    }
  }, [clubSlug])

  const desactivar = useCallback(async () => {
    setEstado('activando')
    setMensaje(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch(`/api/portal/push/unregister?club=${encodeURIComponent(clubSlug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {
          // Si el server no responde, la baja local alcanza: el push expira solo.
        })
      }
      setEstado('desactivado')
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudieron desactivar las notificaciones.')
      setEstado('error')
    }
  }, [clubSlug])

  if (!soportado) {
    return (
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Tu navegador no soporta notificaciones push. Probá con Chrome, Edge o Firefox.
        </p>
      </section>
    )
  }

  const activado = estado === 'activado'
  const ocupado = estado === 'activando'

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {activado ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Notificaciones push</p>
            <p className="mt-0.5 max-w-sm text-sm text-muted-foreground">
              {activado
                ? 'Activadas: vas a recibir un aviso en este dispositivo cuando haya algo nuevo.'
                : 'Activá los avisos del club en este dispositivo: cobranzas, pagos y convocatorias.'}
            </p>
          </div>
        </div>
        <Button size="sm" variant={activado ? 'outline' : 'default'} onClick={activado ? desactivar : activar} disabled={ocupado}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : null}
          {activado ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
      {mensaje && <p className="mt-3 text-xs text-destructive">{mensaje}</p>}
    </section>
  )
}
