import { and, eq, isNull } from 'drizzle-orm'
import { Shield } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'

/**
 * Header de las páginas de auth (login/registro/recuperar). Genérico por
 * default ("Club SaaS"); si se resuelve un club (login llega con
 * ?club=<slug>, ver /registro que ya usa el mismo patrón), muestra su
 * escudo/nombre/tagline reales — nada hardcodeado, sale de `clubs`.
 */
export async function AuthBrandHeader({ clubSlug }: { clubSlug?: string }) {
  const club = clubSlug
    ? (await db.select().from(clubs).where(and(eq(clubs.slug, clubSlug), isNull(clubs.deletedAt))).limit(1))[0]
    : undefined

  if (!club) {
    return (
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Shield className="size-6" />
        </div>
        <p className="text-sm font-semibold tracking-tight">Club SaaS</p>
      </div>
    )
  }

  return (
    <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
      {club.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={club.logoUrl} alt="" width={68} height={77} className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]" />
      ) : (
        <div
          className="flex size-12 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: 'var(--brand-primary, var(--primary))' }}
        >
          <Shield className="size-6" />
        </div>
      )}
      <p className="text-lg font-extrabold tracking-wide text-foreground uppercase">{club.name}</p>
      {club.branding?.tagline && (
        <p
          className="text-[11px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: 'var(--brand-secondary, var(--primary))' }}
        >
          {club.branding.tagline}
        </p>
      )}
    </div>
  )
}
