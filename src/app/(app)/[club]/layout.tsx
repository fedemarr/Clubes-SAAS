import { and, eq, isNull } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  // clubs no tiene club_id (es la tabla raíz del tenant): no lleva RLS,
  // se puede leer directo sin pasar por withTenant().
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)

  if (!club) {
    notFound()
  }

  const primary = club.branding?.primary ?? '#111827'
  const brandStyle = { '--brand-primary': primary } as React.CSSProperties

  return (
    <div style={brandStyle}>
      <header
        style={{
          borderBottom: `4px solid var(--brand-primary)`,
          padding: '1rem 2rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        {club.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt="" width={32} height={32} />
        )}
        <strong>{club.name}</strong>
      </header>
      <main style={{ padding: '2rem' }}>{children}</main>
    </div>
  )
}
