'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmarFoto, iniciarSubidaFoto, quitarFoto } from '../actions'

const MAX_SIZE = 5 * 1024 * 1024
const TIPOS_OK = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Redibuja el bitmap en un canvas para sacar EXIF (ubicación/dispositivo), mismo criterio que documentos (M15). PNG/WEBP no llevan EXIF relevante pero de paso se re-encodan igual. */
async function limpiarImagen(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9),
    )
    if (!blob) return file
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified })
  } catch {
    return file
  }
}

/**
 * Avatar del socio (M16, self-service): iniciales o foto, con un botón de
 * cámara superpuesto para subir/cambiar/quitar. Mismo flujo de R2 que
 * documentos (URL firmada de PUT, subida directa del navegador), pero acá
 * no hay registro "pendiente" que revisar — se guarda en persons.photo_url
 * apenas termina el PUT. Un solo componente reusado en /portal y
 * /portal/carnet (mismo estilo bg-white/15 que ya tenían ambos).
 */
export function AvatarFoto({
  clubSlug,
  photoUrl,
  iniciales,
  size = 'lg',
}: {
  clubSlug: string
  photoUrl: string | null
  iniciales: string
  size?: 'lg' | 'md'
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!f) return
    setError(null)
    if (!TIPOS_OK.has(f.type)) return setError('Tiene que ser JPG, PNG o WEBP.')
    if (f.size > MAX_SIZE) return setError('La foto no puede superar 5 MB.')

    setSubiendo(true)
    const limpia = await limpiarImagen(f)
    const r = await iniciarSubidaFoto(clubSlug, { mimeType: limpia.type, fileSize: limpia.size })
    if (!r.ok) {
      setSubiendo(false)
      return setError(r.error)
    }
    if (r.data.uploadUrl) {
      const up = await fetch(r.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': limpia.type },
        body: limpia,
      })
      if (!up.ok) {
        setSubiendo(false)
        return setError('No se pudo subir la foto. Volvé a intentar.')
      }
    }
    const c = await confirmarFoto(clubSlug, r.data.key)
    setSubiendo(false)
    if (!c.ok) return setError(c.error)
    router.refresh()
  }

  async function onQuitar() {
    setSubiendo(true)
    setError(null)
    const r = await quitarFoto(clubSlug)
    setSubiendo(false)
    if (!r.ok) return setError(r.error)
    router.refresh()
  }

  const dim = size === 'lg' ? 'size-24 text-3xl' : 'size-20 text-2xl'

  return (
    <div className="grid gap-1">
      <div className={cn('relative shrink-0', dim)}>
        <div className="flex size-full items-center justify-center overflow-hidden rounded-2xl bg-white/15 font-bold ring-1 ring-white/30">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="size-full object-cover" />
          ) : (
            iniciales
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          aria-label={photoUrl ? 'Cambiar foto' : 'Subir foto'}
          className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-black/20 transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {subiendo ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </button>

        {photoUrl && !subiendo && (
          <button
            type="button"
            onClick={() => void onQuitar()}
            aria-label="Quitar foto"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 hover:bg-black/80"
          >
            <X className="size-3" />
          </button>
        )}

        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e)} />
      </div>
      {error && <p className="max-w-32 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
