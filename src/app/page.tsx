import Link from 'next/link'
import { asc, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ArrowRight, Shield, UserX } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'
import { rolesEnClub, STAFF_ROLES } from '@/lib/permissions'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

type ClubEntrada = {
  slug: string
  name: string
  logoUrl: string | null
  timezone: string
  esStaff: boolean
}

export default async function Home() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // clubs no tiene club_id -> no pasa por RLS, se puede leer directo.
  const allClubs = await db.select().from(clubs).where(isNull(clubs.deletedAt)).orderBy(asc(clubs.name))

  // persons/person_roles tienen RLS forzado: hay que preguntar por club
  // (withTenant). Por cada club, el usuario entra como staff (dashboard) o
  // como socio (portal), según sus roles vigentes.
  const misClubes: ClubEntrada[] = []
  for (const club of allClubs) {
    const ctx = await rolesEnClub(club.slug)
    if (ctx) {
      misClubes.push({
        slug: club.slug,
        name: club.name,
        logoUrl: club.logoUrl,
        timezone: club.timezone,
        esStaff: ctx.roles.some((r) => STAFF_ROLES.has(r)),
      })
    }
  }

  if (misClubes.length === 1) {
    const c = misClubes[0]!
    redirect(`/${c.slug}/${c.esStaff ? 'dashboard' : 'portal'}`)
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, var(--foreground) 8%, transparent), transparent)',
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Shield className="size-6" />
          </div>
          <p className="text-sm font-semibold tracking-tight">Club SaaS</p>
        </div>

        {misClubes.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserX className="size-5" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">Todavía no estás en ningún club</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tu cuenta está verificada, pero todavía no te inscribieron en un club. El club te tiene que dar de alta.
            </p>
            <div className="mt-4">
              <Button render={<Link href="/login">Ir al login</Link>} variant="outline" className="w-full">
                Volver
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <h1 className="text-center text-sm text-muted-foreground">Elegí tu club</h1>
            {misClubes.map((club) => (
              <Link
                key={club.slug}
                href={`/${club.slug}/${club.esStaff ? 'dashboard' : 'portal'}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                {club.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={club.logoUrl} alt="" width={40} height={40} className="rounded-full ring-1 ring-foreground/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-tight">{club.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {club.esStaff ? 'Panel de gestión' : 'Portal del socio'} · {club.timezone}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
