import { z } from 'zod'
import { eventKind } from '@/db/schema'

export const eventoSchema = z.object({
  kind: z.enum(eventKind.enumValues),
  teamId: z.string().uuid().nullable().optional(),
  title: z.string().min(1, 'Falta el título').max(160),
  location: z.string().max(160).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  opponent: z.string().max(120).optional(),
  recurrenciaSemanalHasta: z.string().date().optional(),
})

export type EventoInput = z.infer<typeof eventoSchema>

export const eventoSchemaPartial = eventoSchema.partial()
