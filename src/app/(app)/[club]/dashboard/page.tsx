import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const [personas, categorias, calendario] = await Promise.all([
    checkPermission('personas.ver', { kind: 'club' }, slug),
    checkPermission('categorias.ver', { kind: 'club' }, slug),
    checkPermission('calendario.ver', { kind: 'club' }, slug),
  ])

  const secciones = [
    { href: `/personas`, titulo: 'Personas', desc: 'Padrón, roles y familias', visible: personas },
    { href: `/categorias`, titulo: 'Categorías', desc: 'Deportes y planteles', visible: categorias },
    { href: `/calendario`, titulo: 'Calendario', desc: 'Eventos y convocatorias', visible: calendario },
  ].filter((s) => s.visible)

  return (
    <main>
      <div className="flex items-center gap-3">
        {club.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt="" width={48} height={48} className="rounded-full" />
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bienvenido a {club.name}</h1>
          <p className="text-sm text-muted-foreground">Tu panel se completa por rol en una fase próxima.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map((s) => (
          <Card key={s.href}>
            <CardHeader>
              <CardTitle className="text-base">{s.titulo}</CardTitle>
              <CardDescription>{s.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/${slug}${s.href}`} className="text-sm font-medium text-primary hover:underline">
                Abrir →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
