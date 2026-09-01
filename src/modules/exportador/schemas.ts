import { z } from 'zod'
import { chargeStatus, paymentStatus, personStatus } from '@/db/schema'

/**
 * Tipos de exportación (M11). Cada tipo define sus filtros y el armado de
 * hojas del Excel. El motor de hojas (excel.ts) es genérico: agregar un
 * tipo nuevo = una entrada acá + una query en queries.ts.
 */
export const TIPOS_EXPORTACION = ['personas', 'movimientos', 'estado_cuenta'] as const
export type TipoExportacion = (typeof TIPOS_EXPORTACION)[number]

export const TIPOS_EXPORTACION_INFO: Record<TipoExportacion, { label: string; descripcion: string }> = {
  personas: {
    label: 'Personas',
    descripcion: 'Padrón con filtros por estado, categoría, deporte y deuda.',
  },
  movimientos: {
    label: 'Movimientos de cuota',
    descripcion: 'Cuenta corriente: cargos, pagos y ajustes en un período.',
  },
  estado_cuenta: {
    label: 'Estado de cuenta de familia',
    descripcion: 'Resumen, detalle y cuotas pendientes de una cuenta corriente.',
  },
}

export const filtrosExportarSchema = z.object({
  club: z.string().trim().min(1),
  tipo: z.enum(TIPOS_EXPORTACION),
  personas: z
    .object({
      categoria: z.string().uuid().nullable().optional(),
      estado: z.enum(personStatus.enumValues).nullable().optional(),
      deporte: z.string().trim().max(40).nullable().optional(),
      conDeuda: z.enum(['si', 'no']).nullable().optional(),
    })
    .optional(),
  movimientos: z
    .object({
      desde: z.string().trim().max(10).optional(),
      hasta: z.string().trim().max(10).optional(),
      tipo: z.enum(['cargo', 'pago', 'ajuste', 'reversion']).nullable().optional(),
      estado: z.string().trim().max(30).nullable().optional(),
      categoria: z.string().uuid().nullable().optional(),
    })
    .optional(),
  estadoCuenta: z
    .object({
      accountId: z.string().uuid(),
      desde: z.string().trim().max(10).optional(),
      hasta: z.string().trim().max(10).optional(),
    })
    .optional(),
})

export type FiltrosExportar = z.infer<typeof filtrosExportarSchema>

export const estadosPersona = personStatus.enumValues
export const estadosCargo = chargeStatus.enumValues
export const estadosPago = paymentStatus.enumValues