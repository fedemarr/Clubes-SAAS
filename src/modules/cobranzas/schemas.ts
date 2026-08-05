import { z } from 'zod'
import { paymentMethod } from '@/db/schema'

export const registrarPagoSchema = z.object({
  accountId: z.string().uuid(),
  montoCents: z.number().int().positive('El monto debe ser mayor a cero'),
  metodo: z.enum(['efectivo', 'transferencia', 'tarjeta']).default('efectivo'),
})

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>

export const revertirPagoSchema = z.object({
  pagoId: z.string().uuid(),
  motivo: z.string().trim().min(5, 'El motivo es obligatorio (mínimo 5 caracteres)').max(200),
})

export type RevertirPagoInput = z.infer<typeof revertirPagoSchema>

export const conciliarPagoSchema = z.object({
  pagoId: z.string().uuid(),
  accountId: z.string().uuid(),
})

export type ConciliarPagoInput = z.infer<typeof conciliarPagoSchema>

export const generarLinkPagoSchema = z.object({
  accountId: z.string().uuid(),
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Período inválido (espera YYYY-MM)')
    .optional(),
})

export type GenerarLinkPagoInput = z.infer<typeof generarLinkPagoSchema>

export const importarExtractoSchema = z.object({
  texto: z.string().min(1, 'Pegá o subí el extracto'),
  separador: z.enum([';', ',']).default(';'),
})

export type ImportarExtractoInput = z.infer<typeof importarExtractoSchema>

// ---------------------------------------------------------------------------
// M4.4 · Débito automático
// ---------------------------------------------------------------------------

export const registrarCbuDebitoSchema = z.object({
  accountId: z.string().uuid(),
  cbu: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{22}$/.test(v), 'El CBU tiene que tener 22 dígitos (o estar vacío para quitarlo)'),
})

export type RegistrarCbuDebitoInput = z.infer<typeof registrarCbuDebitoSchema>

export const generarLoteDebitoSchema = z.object({
  banco: z.string().trim().min(1).max(60).default('generico'),
  fechaEjecucion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (espera AAAA-MM-DD)'),
})

export type GenerarLoteDebitoInput = z.infer<typeof generarLoteDebitoSchema>

export const acreditarLoteDebitoSchema = z.object({
  loteId: z.string().uuid(),
})

export type AcreditarLoteDebitoInput = z.infer<typeof acreditarLoteDebitoSchema>

export const importarRechazosDebitoSchema = z.object({
  loteId: z.string().uuid(),
  texto: z.string().min(1, 'Pegá el archivo de rechazos'),
  separador: z.enum([';', ',']).default(';'),
})

export type ImportarRechazosDebitoInput = z.infer<typeof importarRechazosDebitoSchema>

export const metodoPagoSchema = z.enum(paymentMethod.enumValues)
