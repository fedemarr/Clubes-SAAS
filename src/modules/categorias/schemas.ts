import { z } from 'zod'

export const categoriaSchema = z.object({
  sport: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  season: z.coerce.number().int().min(2000).max(2100),
  birthYearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  birthYearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  isActive: z.boolean().default(true),
})

export type CategoriaInput = z.infer<typeof categoriaSchema>

export const asignacionSchema = z.object({
  personId: z.string().uuid(),
  teamId: z.string().uuid(),
  position: z.string().max(40).optional(),
  validFrom: z.string().date(),
})

export type AsignacionInput = z.infer<typeof asignacionSchema>
