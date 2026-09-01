import { randomUUID } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'
import { checkPermission, rolesEnClub } from '@/lib/permissions'
import { esSuperAdmin } from '@/lib/super-admin'
import { withTenant } from '@/db/tenant'
import {
  TIPOS_EXPORTACION_INFO,
  filtrosExportarSchema,
  type FiltrosExportar,
} from '@/modules/exportador/schemas'
import { buildWorkbook, type HojaExcel } from '@/modules/exportador/excel'
import { estadoCuentaParaExportar, movimientosParaExportar, personasParaExportar } from '@/modules/exportador/queries'

export const dynamic = 'force-dynamic'

const MONEY_HEADER = 'Monto (ARS)'

async function armarExportacion(clubId: string, f: FiltrosExportar): Promise<{ hojas: HojaExcel[]; titulo: string } | null> {
  const info = TIPOS_EXPORTACION_INFO[f.tipo]

  if (f.tipo === 'personas') {
    const { filas, notas } = await personasParaExportar(clubId, f.personas ?? {})
    const hoja: HojaExcel = {
      nombre: 'Personas',
      encabezados: ['Apellido', 'Nombre', 'Documento', 'Nº socio', 'Email', 'Teléfono', 'Nacimiento', 'Categoría', 'Deporte', 'Estado'],
      filas: filas.map((p) => [
        p.apellido,
        p.nombre,
        p.documento ?? '',
        p.nroSocio ?? '',
        p.email ?? '',
        p.telefono ?? '',
        p.nacimiento,
        p.categoria ?? '',
        p.deporte ?? '',
        p.estado,
      ]),
    }
    const audit: HojaExcel = {
      nombre: 'Auditoría',
      encabezados: ['Fecha', 'Acción', 'Entidad', 'Cambio'],
      filas: notas.map((n) => [n.at, n.action, n.entity, n.diff ? JSON.stringify(n.diff) : '']),
    }
    return { hojas: [hoja, audit], titulo: info.label }
  }

  if (f.tipo === 'movimientos') {
    const { filas, mandadoALaCaja } = await movimientosParaExportar(clubId, f.movimientos ?? {})
    const hoja: HojaExcel = {
      nombre: info.label,
      encabezados: ['Fecha', 'Concepto', MONEY_HEADER, 'Tipo', 'Estado', 'Cuenta', 'Comprobante'],
      filas: [
        ...filas.map((m) => [m.fecha, m.concepto, m.montoCents / 100, m.direccion, m.estado, m.cuenta, m.comprobante]),
        [],
        ['TOTAL DÉBITOS', '', mandadoALaCaja.debitoCents / 100, '', '', '', ''],
        ['TOTAL CRÉDITOS', '', mandadoALaCaja.creditoCents / 100, '', '', '', ''],
      ],
      dineroCols: [2],
    }
    return { hojas: [hoja], titulo: info.label }
  }

  const ec = f.estadoCuenta
  if (!ec) return null
  const data = await estadoCuentaParaExportar(clubId, ec.accountId, { desde: ec.desde, hasta: ec.hasta })
  if (!data) return null

  const resumen: HojaExcel = {
    nombre: 'Resumen',
    encabezados: ['Campo', 'Valor'],
    filas: [
      ['Titular', data.resumen.titular],
      ['Cuenta', data.resumen.cuentaLabel ?? ''],
      ['Saldo', data.resumen.balanceCents / 100],
      ['Última actualización', data.resumen.fecha],
    ],
    dineroCols: [1],
  }
  const detalle: HojaExcel = {
    nombre: 'Detalle',
    encabezados: ['Fecha', 'Concepto', MONEY_HEADER, 'Tipo', 'Estado', 'Cuenta', 'Comprobante'],
    filas: data.movimientos.map((m) => [m.fecha, m.concepto, m.montoCents / 100, m.direccion, m.estado, m.cuenta, m.comprobante]),
    dineroCols: [2],
  }
  const cuotas: HojaExcel = {
    nombre: 'Cuotas pendientes',
    encabezados: ['Período', 'Concepto', 'Vence', 'Monto', 'Saldo'],
    filas: data.proximasCuotas.map((c) => [c.period, c.concepto, c.vence, c.montoCents / 100, c.saldoCents / 100]),
    dineroCols: [3, 4],
  }
  return { hojas: [resumen, detalle, cuotas], titulo: `${info.label} · ${data.resumen.titular}` }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = filtrosExportarSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros inválidos', detalle: parsed.error.issues }, { status: 400 })
  }
  const { club: slug, tipo } = parsed.data

  const ctx = await rolesEnClub(slug)
  const sa = ctx ? null : await esSuperAdmin()
  if (!ctx && !sa) return NextResponse.json({ error: 'No sos parte de este club' }, { status: 404 })

  const perm = tipo === 'personas' ? 'personas.ver' as const : 'cuotas.ver' as const
  const permOk = await checkPermission(perm, { kind: 'club' }, slug)
  if (!permOk && !sa) return NextResponse.json({ error: 'Sin permiso para exportar estos datos' }, { status: 403 })

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return NextResponse.json({ error: 'Club inexistente' }, { status: 404 })

  const clubId = ctx?.clubId ?? club.id
  const exportador = session.user.email ?? session.user.name ?? 'staff'

  const armado = await armarExportacion(clubId, parsed.data)
  if (!armado) return NextResponse.json({ error: 'La cuenta no pertenece a este club' }, { status: 404 })

  const buffer = buildWorkbook({
    clubName: club.name,
    titulo: armado.titulo,
    exportador,
    fecha: new Date(),
    hojas: armado.hojas,
  })

  await withTenant(
    clubId,
    async ({ audit }) => {
      audit('exportar', randomUUID(), 'custom', { tipo, totalHojas: armado.hojas.length })
    },
    { userId: session.user.id! },
  )

  const fecha = new Date().toISOString().slice(0, 10)
  const filename = `${slug}_${tipo}_${fecha}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}