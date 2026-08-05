import { z } from 'zod'

export const canalCobranza = z.enum(['whatsapp', 'mail', 'coordinador', 'suspension'])
export type CanalCobranza = z.infer<typeof canalCobranza>

export const guardarReglaCobranzaSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, 'El nombre es obligatorio').max(120),
  dias: z.number().int().min(0, 'Los días no pueden ser negativos').max(365),
  channel: canalCobranza,
  templateKey: z.string().trim().max(60).optional().nullable(),
  dedupeDias: z.number().int().min(1, 'Mínimo 1 día').max(60).default(7),
  enabled: z.boolean().default(true),
})

export type GuardarReglaCobranzaInput = z.infer<typeof guardarReglaCobranzaSchema>

export const guardarPlantillaSchema = z.object({
  id: z.string().uuid().optional(),
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, 'La clave usa minúsculas, números y guión bajo')
    .max(60),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  body: z.string().trim().min(1, 'El texto es obligatorio').max(2000),
})

export type GuardarPlantillaInput = z.infer<typeof guardarPlantillaSchema>

export const eliminarReglaSchema = z.object({
  id: z.string().uuid(),
})

export type EliminarReglaInput = z.infer<typeof eliminarReglaSchema>

export const resolverSugerenciaSchema = z.object({
  id: z.string().uuid(),
})

export type ResolverSugerenciaInput = z.infer<typeof resolverSugerenciaSchema>

export const crearPlanDePagoSchema = z.object({
  accountId: z.string().uuid(),
  totalCents: z.number().int().positive('El total debe ser mayor a cero'),
  cuotas: z.number().int().min(1, 'Mínimo 1 cuota').max(24, 'Máximo 24 cuotas'),
  primeraFecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (espera AAAA-MM-DD)'),
  motivo: z.string().trim().max(200).optional().nullable(),
})

export type CrearPlanDePagoInput = z.infer<typeof crearPlanDePagoSchema>
