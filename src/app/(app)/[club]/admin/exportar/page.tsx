import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs, teams, accounts, persons } from '@/db/schema'
import { checkPermission, rolesEnClub } from '@/lib/permissions'
import { esSuperAdmin } from '@/lib/super-admin'
import { withTenant } from '@/db/tenant'
import { PageHeader } from '@/components/page-header'
import { ExportarForm } from '@/modules/exportador/components/ExportarForm'

export const dynamic = 'force-dynamic'

export default async function ExportarPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  const sa = ctx ? null : await esSuperAdmin()
  if (!ctx && !sa) notFound()

  const puedePersonas = (await checkPermission('personas.ver', { kind: 'club' }, slug)) ?? sa
  const puedeCuotas = (await checkPermission('cuotas.ver', { kind: 'club' }, slug)) ?? sa
  if (!puedePersonas && !puedeCuotas) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para exportar datos.</main>
  }

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const clubId = ctx?.clubId ?? club.id
  const { listaTeams, listaCuentas } = await withTenant(clubId, async ({ tx }) => {
    const listaTeams = await tx
      .select({ id: teams.id, label: teams.label, sport: teams.sport })
      .from(teams)
      .where(and(eq(teams.clubId, clubId), isNull(teams.deletedAt)))
      .orderBy(asc(teams.sport), asc(teams.label))

    const listaCuentas = await tx
      .select({
        id: accounts.id,
        label: accounts.label,
        titular: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
      })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(and(eq(accounts.clubId, clubId), isNull(accounts.deletedAt)))
      .orderBy(asc(persons.lastName))
      .limit(500)

    return { listaTeams, listaCuentas }
  })

  const sports = [...new Set(listaTeams.map((t) => t.sport))].sort()

  return (
    <main>
      <PageHeader
        title="Exportar datos"
        description="Excel multi-sheet con filtros: padrón, movimientos de cuota y estado de cuenta de familia."
      />
      {sa && (
        <p className="mt-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          Modo super admin: estás exportando datos de <span className="font-semibold">{club.name}</span>.
        </p>
      )}
      <ExportarForm
        clubSlug={slug}
        teams={listaTeams}
        sports={sports}
        cuentas={listaCuentas}
        puedePersonas={Boolean(puedePersonas)}
        puedeCuotas={Boolean(puedeCuotas)}
      />
    </main>
  )
}