'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
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

export type ActionResultUpload = { ok: true; data: { documentId: string; uploadUrl: string | null; fileName: string } } | { ok: false; error: string }

const MAX_SIZE = 15 * 1024 * 1024

/**
 * Strip EXIF en el cliente (M15): las fotos de documentos (apto, DNI, etc.)
 * pueden traer metadatos con ubicación/dispositivo. Para JPG/PNG se redibuja
 * el bitmap en un canvas y se re-encoda sin metadatos; para otros formatos
 * (PDF) se deja el archivo original. Devuelve null si no se pudo limpiar.
 */
async function limpiarImagen(file: File): Promise<File | null> {
  const esJpg = file.type === 'image/jpeg'
  const esPng = file.type === 'image/png'
  if (!esJpg && !esPng) return null

  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const contexto = canvas.getContext('2d')
    if (!contexto) return null
    contexto.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, esJpg ? 'image/jpeg' : 'image/png', esJpg ? 0.92 : undefined),
    )
    if (!blob) return null
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified })
  } catch {
    return null
  }
}

/**
 * Sube un documento (M7): elige el tipo, el archivo y las fechas. La server
 * action crea el registro pendiente y devuelve la URL firmada de R2; acá el
 * navegador sube el archivo directo (PUT). Sin R2 (dev) la URL es null y el
 * flujo igual termina: el documento queda pendiente para revisión.
 */
export function SubirDocumentoForm({
  clubSlug,
  personas,
  tipos,
  showPersona,
  action,
  label = 'Subir documento',
}: {
  clubSlug: string
  personas: { id: string; label: string }[]
  tipos: { kind: string; label: string; requiresExpiry: boolean }[]
  showPersona: boolean
  action: (clubSlug: string, input: unknown) => Promise<ActionResultUpload>
  label?: string
}) {
  const router = useRouter()
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '')
  const [kind, setKind] = useState(tipos[0]?.kind ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [limpiando, setLimpiando] = useState(false)
  const [metaStripped, setMetaStripped] = useState(false)
  const [issuedOn, setIssuedOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const tipo = tipos.find((t) => t.kind === kind)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setMetaStripped(false)
    if (!f) return
    if (f.type === 'image/jpeg' || f.type === 'image/png') {
      setLimpiando(true)
      const limpio = await limpiarImagen(f)
      if (limpio) {
        setFile(limpio)
        setMetaStripped(true)
      }
      setLimpiando(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!personaId) return setError('Falta elegir para quién es el documento.')
    if (!file) return setError('Falta elegir el archivo.')
    if (file.size > MAX_SIZE) return setError('El archivo supera los 15 MB.')

    setSubmitting(true)
    const r = await action(clubSlug, {
      personId: personaId,
      kind,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      issuedOn: issuedOn || null,
      expiresOn: expiresOn || null,
    })
    if (!r.ok) {
      setSubmitting(false)
      return setError(r.error)
    }

    if (r.data.uploadUrl) {
      const up = await fetch(r.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!up.ok) {
        setSubmitting(false)
        return setError('El archivo no se pudo subir al almacenamiento. Volvé a intentar.')
      }
    }

    setSubmitting(false)
    setFile(null)
    setMetaStripped(false)
    setIssuedOn('')
    setExpiresOn('')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold tracking-tight dark:text-white">{label}</p>

      {showPersona && (
        <div className="grid gap-1.5">
          <Label htmlFor="doc-persona">Para</Label>
          <Select value={personaId} onValueChange={(v) => setPersonaId(v ?? personas[0]?.id ?? '')}>
            <SelectTrigger id="doc-persona" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {personas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="doc-tipo">Tipo de documento</Label>
        <Select value={kind} onValueChange={(v) => setKind(v ?? tipos[0]?.kind ?? '')}>
          <SelectTrigger id="doc-tipo" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tipos.map((t) => (
              <SelectItem key={t.kind} value={t.kind}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="doc-archivo">Archivo</Label>
        <Input
          id="doc-archivo"
          type="file"
          onChange={(e) => void onFileChange(e)}
          className="h-9 cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-sm"
        />
        {limpiando && <p className="text-xs text-muted-foreground">Limpiando metadatos de la imagen…</p>}
        {metaStripped && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Se quitaron los metadatos de la imagen (EXIF) antes de subir.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="doc-emitido">Emitido el</Label>
          <Input id="doc-emitido" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </div>
        {tipo?.requiresExpiry && (
          <div className="grid gap-1.5">
            <Label htmlFor="doc-vencimiento">Vence el</Label>
            <Input id="doc-vencimiento" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={submitting || !file}>
          {submitting ? 'Subiendo…' : (
            <>
              <UploadCloud data-icon="inline-start" />
              {label}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
