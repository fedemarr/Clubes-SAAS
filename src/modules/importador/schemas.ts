import { z } from 'zod'

/**
 * Tipos de importación soportados por el wizard (M10). Cada tipo define los
 * campos que el usuario mapea manualmente contra las columnas del archivo.
 * El motor es genérico: agregar un tipo nuevo = agregar una entrada acá +
 * un insert en importarFilas del service.
 */
export const TIPOS_IMPORTACION = ['personas', 'categorias'] as const
export type TipoImportacion = (typeof TIPOS_IMPORTACION)[number]

export type TipoCampo = 'texto' | 'email' | 'fecha' | 'entero' | 'estado'

export type CampoImportacion = {
  key: string
  label: string
  required?: boolean
  tipo: TipoCampo
  ejemplo?: string
}

export type TipoImportacionDef = {
  label: string
  descripcion: string
  campos: CampoImportacion[]
}

export const CAMPOS_POR_TIPO: Record<TipoImportacion, TipoImportacionDef> = {
  personas: {
    label: 'Personas (padrón)',
    descripcion:
      'Nombres, documento, contacto y estado. Cada fila crea una persona del padrón. Las filas con documento ya existente se omiten.',
    campos: [
      { key: 'firstName', label: 'Nombre', required: true, tipo: 'texto' },
      { key: 'lastName', label: 'Apellido', required: true, tipo: 'texto' },
      { key: 'docNumber', label: 'DNI / documento', tipo: 'texto' },
      { key: 'bornOn', label: 'Fecha de nacimiento', tipo: 'fecha', ejemplo: 'dd/mm/aaaa' },
      { key: 'email', label: 'Email', tipo: 'email' },
      { key: 'phone', label: 'Teléfono', tipo: 'texto' },
      { key: 'memberNumber', label: 'Número de socio', tipo: 'entero' },
      { key: 'status', label: 'Estado', tipo: 'estado', ejemplo: 'activo | pendiente | inactivo | baja' },
    ],
  },
  categorias: {
    label: 'Categorías (equipos)',
    descripcion:
      'Equipos por deporte, temporada y tramo de años de nacimiento. Se omiten los que ya existen (mismo deporte + categoría + temporada).',
    campos: [
      { key: 'sport', label: 'Deporte', required: true, tipo: 'texto' },
      { key: 'label', label: 'Categoría', required: true, tipo: 'texto' },
      { key: 'season', label: 'Temporada (año)', required: true, tipo: 'entero' },
      { key: 'birthYearFrom', label: 'Año de nacimiento desde', tipo: 'entero' },
      { key: 'birthYearTo', label: 'Año de nacimiento hasta', tipo: 'entero' },
    ],
  },
}

export const MAX_FILAS_IMPORTACION = 5000

export const guardarMapeoSchema = z.object({
  tipo: z.enum(TIPOS_IMPORTACION),
  mapping: z.record(z.string(), z.number().int().nullable()),
  hasHeader: z.boolean(),
})

export type GuardarMapeoInput = z.infer<typeof guardarMapeoSchema>

export type MapeoImportacion = Record<string, number | null>

export const importarInputSchema = z.object({
  tipo: z.enum(TIPOS_IMPORTACION),
  fileName: z.string().trim().max(255).default('importacion.xlsx'),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .max(MAX_FILAS_IMPORTACION, `El archivo supera las ${MAX_FILAS_IMPORTACION} filas permitidas.`),
})

export type ImportarInput = z.infer<typeof importarInputSchema>