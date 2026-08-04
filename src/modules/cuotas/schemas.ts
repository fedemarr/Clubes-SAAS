import { z } from 'zod'
import { membershipStatus } from '@/db/schema'

export const planSchema = z.object({
  name: z.string().min(1, 'Falta el nombre').max(100),
  sport: z.string().max(40).nullable().optional(),
  amountCents: z.number().int().positive('El monto debe ser mayor a cero'),
  siblingDiscounts: z.array(z.number().int().min(0).max(100)).max(5).optional(),
  validFrom: z.string().date(),
})

export type PlanInput = z.infer<typeof planSchema>

export const ajustePrecioSchema = z.object({
  sport: z.string().min(1, 'Falta el deporte').max(40),
  nombre: z.string().min(1, 'Falta el nombre').max(100),
  amountCents: z.number().int().positive('El monto debe ser mayor a cero'),
  siblingDiscounts: z.array(z.number().int().min(0).max(100)).max(5).optional(),
  validFrom: z.string().date(),
})

export type AjustePrecioInput = z.infer<typeof ajustePrecioSchema>

export const membresiaSchema = z.object({
  personId: z.string().uuid(),
  accountId: z.string().uuid(),
  feePlanId: z.string().uuid(),
  status: z.enum(membershipStatus.enumValues).default('activa'),
  startedOn: z.string().date(),
})

export type MembresiaInput = z.infer<typeof membresiaSchema>

export const terminarMembresiaSchema = z.object({
  membershipId: z.string().uuid(),
  endedOn: z.string().date(),
})

export type TerminarMembresiaInput = z.infer<typeof terminarMembresiaSchema>

export const periodoSchema = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Período inválido (espera YYYY-MM)'),
})

export type PeriodoInput = z.infer<typeof periodoSchema>
