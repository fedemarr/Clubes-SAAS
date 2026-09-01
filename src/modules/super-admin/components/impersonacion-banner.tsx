'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { terminarImpersonacion } from '../actions'
import { Button } from '@/components/ui/button'

/**
 * Banner fijo que se muestra cuando hay una impersonación activa (M14):
 * avisa que la identidad efectiva es la de la persona imitada y permite volver
 * a la identidad real del super admin con un clic.
 */
export function ImpersonacionBanner({ nombre, tipo }: { nombre: string; tipo: 'staff' | 'socio' }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function salir() {
    setLoading(true)
    const res = await terminarImpersonacion()
    setLoading(false)
    if (!res.ok) return
    router.replace('/super-admin')
    router.refresh()
  }

  const descripcion = tipo === 'staff' ? 'Viendo como miembro del staff' : 'Viendo como socio'

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium text-amber-800">
          <Crosshair className="size-4 shrink-0" />
          Modo superadmin · {descripcion} <span className="font-bold">{nombre}</span>
        </p>
        <Button size="xs" variant="outline" onClick={() => void salir()} disabled={loading}>
          {loading ? 'Saliendo…' : 'Salir de impersonación'}
        </Button>
      </div>
    </div>
  )
}