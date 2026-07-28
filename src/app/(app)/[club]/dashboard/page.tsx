import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'

export default async function DashboardPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)

  return <h1>Bienvenido a {club?.name}</h1>
}
