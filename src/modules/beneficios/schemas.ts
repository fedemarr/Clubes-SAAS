import { z } from 'zod'

/**
 * Beneficios dinámicos del portal (M12). Los arma el staff del club desde
 * `/admin/beneficios` y el socio los ve en el home del portal.
 */
export const beneficioSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'El título es obligatorio').max(160, 'Máximo 160 caracteres'),
  description: z.string().trim().max(500, 'Máximo 500 caracteres').optional().default(''),
  icon: z.string().trim().max(40).optional().default(''),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
  active: z.boolean().optional().default(true),
})

export const beneficioIdSchema = z.object({ id: z.string().uuid() })

export type BeneficioInput = z.infer<typeof beneficioSchema>