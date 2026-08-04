import { and, eq, gte, isNull, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs, personRoles, persons, roleKind } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { auth } from '@/lib/auth/config'

export type RoleKind = (typeof roleKind.enumValues)[number]

/**
 * Solo lo que M1 necesita. No es la matriz completa de la sección 7 del
 * brief — se amplía a medida que cada módulo la necesite, sin rediseñar:
 * agregar un string a `Permission` y una entrada a ROLE_PERMISSIONS.
 */
export type Permission =
  | 'personas.ver'
  | 'personas.editar'
  | 'categorias.ver'
  | 'categorias.editar'
  | 'calendario.ver'
  | 'calendario.editar'
  | 'convocatoria.ver'
  | 'convocatoria.publicar'

export type Scope = { kind: 'club' } | { kind: 'team'; teamId: string }

const ROLE_PERMISSIONS: Partial<Record<RoleKind, Permission[]>> = {
  presidente: ['personas.ver', 'personas.editar', 'categorias.ver', 'categorias.editar', 'calendario.ver', 'calendario.editar', 'convocatoria.ver', 'convocatoria.publicar'],
  secretaria: ['personas.ver', 'personas.editar', 'categorias.ver', 'categorias.editar', 'calendario.ver', 'calendario.editar', 'convocatoria.ver'],
  tesorero: ['personas.ver', 'categorias.ver', 'calendario.ver'],
  coordinador: ['personas.ver', 'categorias.ver', 'categorias.editar', 'calendario.ver', 'calendario.editar', 'convocatoria.ver', 'convocatoria.publicar'], // scope: su team
  entrenador: ['personas.ver', 'categorias.ver', 'categorias.editar', 'calendario.ver', 'convocatoria.ver', 'convocatoria.publicar'], // scope: su team (plantel)
  manager: ['personas.ver', 'categorias.ver', 'calendario.ver', 'convocatoria.ver', 'convocatoria.publicar'], // scope: su team
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`No tenés permiso "${permission}"`)
    this.name = 'PermissionError'
  }
}

export type PermissionContext = {
  clubId: string
  personId: string
  userId: string
  roles: RoleKind[]
  scopeTeamIds: string[]
}

/**
 * Helper obligatorio en toda action y toda página (sección 7 del brief).
 * Tira PermissionError si no hay sesión, si el club no existe, o si
 * ningún rol vigente del actor en ese club cubre el permiso (y el scope,
 * si es de team). Las actions atrapan el error y devuelven
 * { ok: false, error }; nunca lo dejan llegar al cliente sin envolver.
 */
export async function requirePermission(
  permission: Permission,
  scope: Scope,
  clubSlug: string,
): Promise<PermissionContext> {
  const session = await auth()
  if (!session?.user?.id) throw new PermissionError(permission)

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, clubSlug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) throw new PermissionError(permission)

  const today = new Date().toISOString().slice(0, 10)
  const userId = session.user.id

  const activeRoles = await withTenant(club.id, async ({ tx }) => {
    return tx
      .select({ personId: persons.id, role: personRoles.role, scopeTeamId: personRoles.scopeTeamId })
      .from(persons)
      .innerJoin(personRoles, eq(personRoles.personId, persons.id))
      .where(
        and(
          eq(persons.clubId, club.id),
          eq(persons.userId, userId),
          isNull(persons.deletedAt),
          or(isNull(personRoles.validTo), gte(personRoles.validTo, today)),
        ),
      )
  })

  const matching = activeRoles.filter((r) => {
    const perms = ROLE_PERMISSIONS[r.role] ?? []
    if (!perms.includes(permission)) return false
    if (scope.kind === 'team' && r.scopeTeamId && r.scopeTeamId !== scope.teamId) return false
    return true
  })

  if (matching.length === 0 || !activeRoles[0]) throw new PermissionError(permission)

  return {
    clubId: club.id,
    personId: activeRoles[0].personId,
    userId,
    roles: activeRoles.map((r) => r.role),
    scopeTeamIds: [...new Set(activeRoles.map((r) => r.scopeTeamId).filter((id): id is string => Boolean(id)))],
  }
}

/**
 * Para páginas (Server Components), no Server Actions: devuelve `null` en
 * vez de tirar. La regla 7 del brief exige el chequeo en toda página
 * también, no solo en las actions que escriben.
 */
export async function checkPermission(permission: Permission, scope: Scope, clubSlug: string): Promise<PermissionContext | null> {
  try {
    return await requirePermission(permission, scope, clubSlug)
  } catch {
    return null
  }
}
