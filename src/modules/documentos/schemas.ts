import { z } from 'zod'

export const KINDS_DOCUMENTO = [
  'apto_medico',
  'dni',
  'consentimiento_imagen',
  'consentimiento_tutor',
  'seguro',
  'ficha_federativa',
  'otro',
] as const

export const guardarTipoDocumentoSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(KINDS_DOCUMENTO),
  label: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  requiresExpiry: z.boolean(),
  alertDays: z.array(z.number().int().min(0).max(365)).max(6),
  enabled: z.boolean(),
})

export const revisarDocumentoSchema = z.object({
  documentId: z.string().uuid(),
  aprobar: z.boolean(),
  rejectionReason: z.string().trim().max(255).optional(),
})

export const subirDocumentoSchema = z.object({
  personId: z.string().uuid(),
  kind: z.enum(KINDS_DOCUMENTO),
  fileName: z.string().trim().min(1, 'Falta el archivo').max(255),
  mimeType: z.string().trim().min(1).max(120),
  fileSize: z.number().int().positive('El archivo está vacío').max(15 * 1024 * 1024, 'Máximo 15 MB'),
  issuedOn: z.string().date().nullable().optional(),
  expiresOn: z.string().date().nullable().optional(),
})

export const documentoIdSchema = z.object({ documentId: z.string().uuid() })
