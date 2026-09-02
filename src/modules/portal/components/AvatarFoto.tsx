'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmarFoto, iniciarSubidaFoto, quitarFoto } from '../actions'

const MAX_SIZE = 5 * 1024 * 1024
// Tope del archivo ORIGINAL (antes de re-encodar): una foto de celular sin
// comprimir, sobre todo HEIC de iPhone, pesa bastante más que el resultado
// final en JPEG — no se puede validar contra MAX_SIZE en este punto.
const MAX_SIZE_ORIGINAL = 25 * 1024 * 1024

/**
 * Redibuja el bitmap en un canvas para sacar EXIF (ubicación/dispositivo,
 * mismo criterio que documentos en M15) y de paso normaliza CUALQUIER
 * formato que el navegador sepa decodificar a JPG/PNG — en particular HEIC
 * de iPhone, que Safari entrega tal cual desde la cámara/Fotos y que el
 * input de archivo no siempre convierte solo. Antes se validaba el tipo del
 * archivo ORIGINAL contra una lista fija (jpg/png/webp) y esto rechazaba
 * un HEIC antes de intentar convertirlo — por eso "no dejaba subir la
 * foto" en iPhone. Ahora se intenta decodificar cualquier cosa y se valida
 * recién el resultado. Devuelve null si el navegador no pudo decodificarlo.
 */
async function limpiarImagen(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9),
    )
    if (!blob) return null
    const nombre = file.name.replace(/\.(heic|heif)$/i, blob.type === 'image/png' ? '.png' : '.jpg')
    return new File([blob], nombre, { type: blob.type, lastModified: file.lastModified })
  } catch {
    return null
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
    if (f.size > MAX_SIZE_ORIGINAL) return setError('La foto es demasiado pesada.')

    setSubiendo(true)
    const limpia = await limpiarImagen(f)
    if (!limpia) {
      setSubiendo(false)
      return setError('No se pudo procesar esa imagen. Probá con otra foto.')
    }
    if (limpia.size > MAX_SIZE) {
      setSubiendo(false)
      return setError('La foto no puede superar 5 MB.')
    }
    const r = await iniciarSubidaFoto(clubSlug, { mimeType: limpia.type, fileSize: limpia.size })
    if (!r.ok) {
      setSubiendo(false)
      return setError(r.error)
    }
    if (r.data.uploadUrl) {
      // El PUT directo al bucket puede fallar por red o por CORS del lado
      // de R2 (rechaza el preflight silenciosamente, fetch tira una
      // excepción, no una respuesta con !ok) — antes eso quedaba como una
      // promesa rechazada sin capturar: la UI se quedaba con el spinner
      // trabado y, al refrescar, la foto nunca se había confirmado. Ahora
      // se atrapa y se muestra un error real.
      try {
        const up = await fetch(r.data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': limpia.type },
          body: limpia,
        })
        if (!up.ok) {
          setSubiendo(false)
          return setError('No se pudo subir la foto. Volvé a intentar.')
        }
      } catch {
        setSubiendo(false)
        return setError('No se pudo conectar con el almacenamiento. Volvé a intentar en un rato.')
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

        {/* accept="image/*" (no una lista fija): el picker del celular no
            tiene que filtrar según lo que el servidor guarda — cualquier
            foto que el navegador pueda decodificar se normaliza en
            limpiarImagen(). Una lista fija acá es lo que escondía HEIC
            en algunos selectores de iPhone. */}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />
      </div>
      {error && <p className="max-w-32 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
