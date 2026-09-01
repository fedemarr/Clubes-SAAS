'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileSpreadsheet, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { guardarMapeo, importarImportacion, validarImportacion, type ValidacionResultado, type ImportacionResultado } from '../actions'
import { CAMPOS_POR_TIPO, MAX_FILAS_IMPORTACION, type MapeoImportacion, type TipoImportacion } from '../schemas'
import type { MapeoGuardado } from '../queries'

const PASOS = ['Tipo', 'Archivo', 'Mapeo', 'Validación', 'Vista previa', 'Confirmar']

type MapeosProp = Partial<Record<TipoImportacion, MapeoGuardado>>

type CeldaTipo = string | number | boolean | null

function normalizarClave(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sugerirMapeo(campos: (typeof CAMPOS_POR_TIPO)['personas']['campos'], columnas: string[]): MapeoImportacion {
  const sinAcentos = columnas.map((c) => normalizarClave(String(c).trim()))
  const ALIASES: Record<string, string[]> = {
    firstName: ['nombre', 'nombres', 'nombreys', 'name'],
    lastName: ['apellido', 'apellidos', 'lastname', 'apellidoynombre', 'nombreyapellido'],
    docNumber: ['dni', 'documento', 'doc', 'nro doc', 'nrodoc'],
    bornOn: ['nacimiento', 'fecha nacimiento', 'fechanacimiento', 'nacio', 'nac', 'birth'],
    email: ['email', 'mail', 'correo', 'e-mail'],
    phone: ['telefono', 'celular', 'cel', 'movil', 'whatsapp', 'tel'],
    memberNumber: ['socio', 'nro socio', 'nro de socio', 'numerosocio', 'legajo', 'n°socio'],
    status: ['estado', 'situacion', 'condicion'],
    sport: ['deporte', 'disciplina'],
    label: ['categoria', 'equipo', 'division', 'categoria equipo', 'categoriaequipo'],
    season: ['temporada', 'ano', 'año', 'anio', 'ciclo', 'temporada ano'],
    birthYearFrom: ['ano desde', 'desde', 'nro desde', 'ancfrom'],
    birthYearTo: ['ano hasta', 'hasta', 'anhasta'],
  }
  const out: MapeoImportacion = {}
  const usadas = new Set<number>()
  for (const campo of campos) {
    const placeholders = [normalizarClave(campo.label), ...(ALIASES[campo.key] ?? [])]
    let idx = -1
    for (let i = 0; i < sinAcentos.length; i++) {
      if (usadas.has(i)) continue
      if (placeholders.some((p) => sinAcentos[i].startsWith(p) || sinAcentos[i].includes(p) || p.startsWith(sinAcentos[i]))) {
        idx = i
        break
      }
    }
    if (idx >= 0) {
      out[campo.key] = idx
      usadas.add(idx)
    } else {
      out[campo.key] = null
    }
  }
  return out
}

function coincideGuardado(mapeo: MapeoGuardado, columnas: string[]): boolean {
  const guardado = mapeo.mapping
  if (!guardado || Object.keys(guardado).length === 0) return false
  const idxs = Object.values(guardado).filter((v): v is number => v !== null && v !== undefined)
  return idxs.every((i) => i >= 0 && i < columnas.length)
}

export function ImporterWizard({ clubSlug, mapeos }: { clubSlug: string; mapeos: MapeosProp }) {
  const [paso, setPaso] = useState(1)
  const [tipo, setTipo] = useState<TipoImportacion | null>(null)
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [grid, setGrid] = useState<CeldaTipo[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<MapeoImportacion>({})
  const [validacion, setValidacion] = useState<ValidacionResultado | null>(null)
  const [resultado, setResultado] = useState<ImportacionResultado | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const definicion = tipo ? CAMPOS_POR_TIPO[tipo] : null

  const { columnas, filas } = useMemo(() => {
    if (grid.length === 0) return { columnas: [], filas: [] }
    const conHeader = hasHeader && grid.length > 1
    const header = conHeader ? grid[0] : null
    const data = conHeader ? grid.slice(1) : grid
    const columnas = Array.from({ length: Math.max(...data.map((r) => r.length), header ? header.length : 0, 1) }, (_, i) =>
      header ? String(header[i] ?? '').trim() || `Columna ${i + 1}` : `Columna ${i + 1}`,
    )
    const filas = data.map((cells, index) => ({ index, cells }))
    return { columnas, filas }
  }, [grid, hasHeader])

  const filasMapeadas = useMemo(() => {
    if (!tipo) return []
    return filas.map((f) => {
      const data: Record<string, unknown> = {}
      for (const campo of CAMPOS_POR_TIPO[tipo].campos) {
        const idx = mapping[campo.key]
        data[campo.key] = idx === null || idx === undefined ? '' : (f.cells[idx] ?? '')
      }
      return { index: f.index, data }
    })
  }, [filas, mapping, tipo])

  const faltanObligatorios = tipo
    ? definicion!.campos.some((c) => c.required && (mapping[c.key] === null || mapping[c.key] === undefined))
    : true

  useEffect(() => {
    if (!tipo || columnas.length === 0) return
    const guardado = mapeos[tipo]
    if (guardado && coincideGuardado(guardado, columnas)) {
      setMapping({ ...guardado.mapping })
      setHasHeader(guardado.hasHeader)
    } else {
      setMapping(sugerirMapeo(CAMPOS_POR_TIPO[tipo].campos, columnas))
      setHasHeader(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, columnas])

  async function procesarArchivo(file: File) {
    setError(null)
    setTrabajando(true)
    try {
      const XLSX = await import('xlsx')
      const esCsv = /\.csv$/i.test(file.name)
      const wb = esCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('El archivo no tiene hojas de cálculo.')
      const celdas = XLSX.utils.sheet_to_json<CeldaTipo[]>(ws, { header: 1, raw: false, defval: '' })
      const limpias = celdas.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''))
      if (limpias.length === 0) throw new Error('El archivo no tiene filas con datos.')
      setGrid(limpias)
      setArchivoNombre(file.name)
      setMapping({})
      setValidacion(null)
      setResultado(null)
      setHasHeader(true)
      setPaso(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setTrabajando(false)
    }
  }

  async function pasarAValidacion() {
    if (!tipo) return
    setError(null)
    setTrabajando(true)
    try {
      await guardarMapeo(clubSlug, { tipo, mapping, hasHeader }).catch(() => null)
      const res = await validarImportacion(clubSlug, { tipo, rows: filasMapeadas.map((f) => f.data) })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setValidacion(res.data)
      setPaso(4)
    } catch {
      setError('Hubo un problema validando el archivo.')
    } finally {
      setTrabajando(false)
    }
  }

  async function confirmarImportacion() {
    if (!tipo) return
    setError(null)
    setTrabajando(true)
    try {
      const res = await importarImportacion(clubSlug, {
        tipo,
        fileName: archivoNombre ?? 'importacion.xlsx',
        rows: filasMapeadas.map((f) => f.data),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResultado(res.data)
      setPaso(6)
    } catch {
      setError('No se pudo importar. Intentá de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  function reiniciar() {
    setPaso(1)
    setTipo(null)
    setArchivoNombre(null)
    setGrid([])
    setMapping({})
    setValidacion(null)
    setResultado(null)
    setError(null)
  }

  const previewFilas = validacion?.rows ?? []

  return (
    <div className="mt-6 space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2">
        {PASOS.map((nombre, i) => {
          const n = i + 1
          const activo = paso === n
          const pasado = paso > n
          return (
            <li key={nombre} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  pasado ? 'bg-primary text-primary-foreground' : activo ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground',
                )}
              >
                {pasado ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn('text-xs font-medium', activo ? 'text-foreground' : 'text-muted-foreground')}>{nombre}</span>
              {n < PASOS.length && <span className="mx-1 h-px w-3 bg-border" />}
            </li>
          )
        })}
      </ol>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Paso 1 · Tipo */}
      {paso === 1 && (
        <div>
          <h2 className="text-sm font-semibold">¿Qué querés importar?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(Object.keys(CAMPOS_POR_TIPO) as TipoImportacion[]).map((t) => {
              const def = CAMPOS_POR_TIPO[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTipo(t)
                    setPaso(2)
                  }}
                  className="rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 hover:bg-accent/40"
                >
                  <p className="text-sm font-semibold">{def.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{def.descripcion}</p>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    {def.campos.filter((c) => c.required).map((c) => c.label).join(' · ')} requeridos
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Paso 2 · Archivo */}
      {paso === 2 && tipo && (
        <div>
          <h2 className="text-sm font-semibold">Subí el archivo ({definicion!.label})</h2>
          <label
            className={cn(
              'mt-3 flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm',
              trabajando ? 'pointer-events-none opacity-60' : 'hover:border-primary/50 hover:bg-accent/40',
            )}
          >
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="font-medium">{trabajando ? 'Leyendo archivo...' : 'Elegí un archivo .xlsx, .xls o .csv'}</span>
            <span className="text-xs text-muted-foreground">La primera fila se usa como encabezado (se puede cambiar después).</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              disabled={trabajando}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void procesarArchivo(file)
              }}
            />
          </label>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(1)} disabled={trabajando}>
              <ChevronLeft className="size-4" /> Volver
            </Button>
          </div>
        </div>
      )}

      {/* Paso 3 · Mapeo */}
      {paso === 3 && tipo && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Mapeá las columnas del archivo</h2>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="size-4 accent-primary"
              />
              La primera fila es encabezado
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {filas.length} filas de datos · {archivoNombre}
          </p>
          {filas.length > MAX_FILAS_IMPORTACION && (
            <p className="mt-2 text-xs text-red-600">Supera el máximo de {MAX_FILAS_IMPORTACION} filas: achicá el archivo.</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {definicion!.campos.map((campo) => {
              const idxActual = mapping[campo.key]
              return (
                <label key={campo.key} className="block rounded-xl border bg-card p-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {campo.label}
                    {campo.required && <span className="text-red-600">*</span>}
                  </span>
                  <select
                    value={idxActual === null || idxActual === undefined ? '' : String(idxActual)}
                    onChange={(e) => {
                      const v = e.target.value
                      setMapping((m) => ({ ...m, [campo.key]: v === '' ? null : Number(v) }))
                    }}
                    className="mt-2 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">— Sin mapear</option>
                    {columnas.map((c, i) => (
                      <option key={i} value={String(i)}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {campo.ejemplo && <p className="mt-1.5 text-[11px] text-muted-foreground">ej: {campo.ejemplo}</p>}
                </label>
              )
            })}
          </div>

          {/* Preview del mapeo */}
          <div className="mt-5 overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Fila</th>
                    {definicion!.campos
                      .filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined)
                      .map((c) => (
                        <th key={c.key} className="px-3 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {filasMapeadas.slice(0, 6).map((f) => (
                    <tr key={f.index} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{f.index + 1}</td>
                      {definicion!.campos
                        .filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined)
                        .map((c) => (
                          <td key={c.key} className="px-3 py-2">
                            {String(f.data[c.key] ?? '') || <span className="text-muted-foreground/60">—</span>}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(2)} disabled={trabajando}>
              <ChevronLeft className="size-4" /> Volver
            </Button>
            <Button
              type="button"
              onClick={() => void pasarAValidacion()}
              disabled={faltanObligatorios || filas.length === 0 || filas.length > MAX_FILAS_IMPORTACION || trabajando}
            >
              {trabajando ? 'Validando...' : 'Validar'} <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Paso 4 · Validación */}
      {paso === 4 && tipo && validacion && (
        <div>
          <h2 className="text-sm font-semibold">Validación</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-semibold tabular-nums">{validacion.total}</p>
              <p className="text-xs text-muted-foreground">filas</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-semibold tabular-nums text-green-700">{validacion.ok}</p>
              <p className="text-xs text-muted-foreground">a importar</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-semibold tabular-nums text-amber-600">{validacion.duplicadas}</p>
              <p className="text-xs text-muted-foreground">ya existían</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-2xl font-semibold tabular-nums text-red-600">{validacion.conErrores}</p>
              <p className="text-xs text-muted-foreground">con errores</p>
            </div>
          </div>

          {validacion.conErrores > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border bg-card">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                Primeras filas con errores
              </div>
              <ul className="divide-y">
                {validacion.rows
                  .filter((r) => r.estado === 'error')
                  .slice(0, 8)
                  .map((r) => (
                    <li key={r.index} className="px-3 py-2 text-xs">
                      <span className="font-semibold">Fila {r.index + 1}:</span>{' '}
                      <span className="text-muted-foreground">{r.errores.join(' · ')}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(3)}>
              <ChevronLeft className="size-4" /> Volver
            </Button>
            <Button type="button" onClick={() => setPaso(5)} disabled={validacion.ok === 0}>
              Ver vista previa <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Paso 5 · Vista previa */}
      {paso === 5 && tipo && validacion && (
        <div>
          <h2 className="text-sm font-semibold">Vista previa</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {previewFilas.length} filas · {validacion.ok} a importar, {validacion.duplicadas} duplicadas, {validacion.conErrores} con errores
          </p>
          <div className="mt-3 max-h-96 overflow-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  {definicion!.campos
                    .filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined)
                    .map((c) => (
                      <th key={c.key} className="px-3 py-2 font-medium">
                        {c.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {previewFilas.slice(0, 250).map((r) => (
                  <tr key={r.index} className="border-t">
                    <td className="px-3 py-2">
                      <Badge
                        variant={r.estado === 'ok' ? 'outline' : r.estado === 'duplicada' ? 'secondary' : 'destructive'}
                        className={r.estado === 'ok' ? 'text-green-700' : undefined}
                      >
                        {r.estado === 'ok' ? 'Lista' : r.estado === 'duplicada' ? 'Duplicada' : 'Errores'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.index + 1}</td>
                    {definicion!.campos
                      .filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined)
                      .map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          {String(filasMapeadas.find((f) => f.index === r.index)?.data[c.key] ?? '') || '—'}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewFilas.length > 250 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Mostrando las primeras 250 filas de {previewFilas.length}.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPaso(4)}>
              <ChevronLeft className="size-4" /> Volver
            </Button>
            <Button type="button" onClick={() => setPaso(6)} disabled={validacion.ok === 0}>
              Continuar <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Paso 6 · Confirmar */}
      {paso === 6 && tipo && validacion && (
        <div>
          {resultado ? (
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center gap-2 text-green-700">
                <Check className="size-5" />
                <h2 className="text-base font-semibold">Importación completada</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Se importaron <span className="font-semibold text-foreground">{resultado.importados}</span> de{' '}
                {resultado.total} filas.
                {resultado.omitidos > 0 && ` (${resultado.omitidos} se omitieron por conflicto)`}
                {resultado.duplicadas > 0 && ` · ${resultado.duplicadas} ya existían`}
                {resultado.conErrores > 0 && ` · ${resultado.conErrores} con errores`}.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button render={<a href={`/${clubSlug}/personas`}>Ver padrón</a>} />
                <Button type="button" variant="outline" onClick={reiniciar}>
                  <Upload className="size-4" /> Importar otro
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-sm font-semibold">Confirmá la importación</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Vas a importar <span className="font-semibold text-foreground">{validacion.ok}</span> filas de{' '}
                {definicion!.label} ({archivoNombre}). Las {validacion.duplicadas} duplicadas y las{' '}
                {validacion.conErrores} con errores se descartan. La operación queda registrada para auditoría.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setPaso(5)} disabled={trabajando}>
                  <ChevronLeft className="size-4" /> Volver
                </Button>
                <Button type="button" onClick={() => void confirmarImportacion()} disabled={trabajando}>
                  {trabajando ? 'Importando...' : `Importar ${validacion.ok} filas`}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}