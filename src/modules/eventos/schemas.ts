import { z } from 'zod'
import { eventKind, participationStatus } from '@/db/schema'

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

export const convocatoriaSchema = z.object({
  eventId: z.string().uuid(),
  personIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un jugador para convocar'),
})

export type ConvocatoriaInput = z.infer<typeof convocatoriaSchema>

/** Estados que un manager puede marcar en la pantalla de asistencia. */
export const asistenciaEstados = ['presente', 'ausente', 'justificado'] as const
export type AsistenciaEstado = (typeof asistenciaEstados)[number]

export const asistenciaSchema = z.object({
  eventId: z.string().uuid(),
  cambios: z
    .array(
      z.object({
        personId: z.string().uuid(),
        status: z
          .enum(participationStatus.enumValues)
          .refine((s) => s === 'convocado' || asistenciaEstados.includes(s as AsistenciaEstado), {
            message: 'Estado de asistencia inválido',
          }),
      }),
    )
    .min(1, 'No hay cambios para guardar'),
})

export type AsistenciaInput = z.infer<typeof asistenciaSchema>
