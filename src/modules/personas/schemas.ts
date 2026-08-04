import { z } from 'zod'
import { personStatus, relationshipKind, roleKind } from '@/db/schema'

export const personaSchema = z.object({
  firstName: z.string().min(1, 'Falta el nombre').max(80),
  lastName: z.string().min(1, 'Falta el apellido').max(80),
  docType: z.string().max(12).default('DNI'),
  docNumber: z.string().max(20).optional(),
  bornOn: z.string().date().optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  photoUrl: z.string().url().max(2048).optional().or(z.literal('')),
  status: z.enum(personStatus.enumValues).default('activo'),
})

export type PersonaInput = z.infer<typeof personaSchema>

export const rolSchema = z.object({
  personId: z.string().uuid(),
  role: z.enum(roleKind.enumValues),
  scopeTeamId: z.string().uuid().optional(),
  validFrom: z.string().date(),
  validTo: z.string().date().optional(),
})

export type RolInput = z.infer<typeof rolSchema>

export const vinculoSchema = z.object({
  personId: z.string().uuid(),
  relatedPersonId: z.string().uuid(),
  kind: z.enum(relationshipKind.enumValues),
})

export type VinculoInput = z.infer<typeof vinculoSchema>

export const busquedaSchema = z.object({
  q: z.string().optional(),
  categoria: z.string().uuid().optional(),
  estado: z.enum(personStatus.enumValues).optional(),
})

export type BusquedaInput = z.infer<typeof busquedaSchema>
