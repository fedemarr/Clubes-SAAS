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

export const metodoPagoSchema = z.enum(paymentMethod.enumValues)
