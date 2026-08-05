import { eq, sql } from 'drizzle-orm'
import { db } from './client'
import { clubs } from './schema'
import { withTenant } from './tenant'

/**
 * Tipos de documento por defecto (M7) para los-clubes de desarrollo.
 * Idempotente: upsert por (club_id, kind), nunca duplica. Las alertas de
 * vencimiento son 30/15/3 días para los tipos que vencen.
 */

const DEFAULT_TIPOS = [
  { kind: 'apto_medico', label: 'Apto médico', requiresExpiry: true, alertDays: [30, 15, 3] },
  { kind: 'dni', label: 'DNI', requiresExpiry: false, alertDays: [] },
  { kind: 'consentimiento_imagen', label: 'Consentimiento de imagen', requiresExpiry: false, alertDays: [] },
  { kind: 'consentimiento_tutor', label: 'Consentimiento del tutor', requiresExpiry: false, alertDays: [] },
  { kind: 'seguro', label: 'Seguro', requiresExpiry: true, alertDays: [30, 15, 3] },
  { kind: 'ficha_federativa', label: 'Ficha federativa', requiresExpiry: true, alertDays: [30, 15, 3] },
  { kind: 'otro', label: 'Otro', requiresExpiry: false, alertDays: [] },
] as const

const SLUGS = ['los-cedros', 'demo-fc']

async function sembrarClub(clubId: string) {
  await withTenant(clubId, async ({ tx }) => {
    for (const t of DEFAULT_TIPOS) {
      const dias = `{${t.alertDays.join(',')}}`
      await tx.execute(sql`
        INSERT INTO document_types (club_id, kind, label, requires_expiry, alert_days, enabled)
        VALUES (${clubId}, ${t.kind}, ${t.label}, ${t.requiresExpiry}, ${dias}::int[], true)
        ON CONFLICT (club_id, kind) DO UPDATE
        SET label = EXCLUDED.label, requires_expiry = EXCLUDED.requires_expiry,
            alert_days = EXCLUDED.alert_days, enabled = true, updated_at = now()
      `)
    }
  })
}

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-documentos.ts: NODE_ENV=production. Abortado.')
  }

  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) throw new Error('seed-documentos.ts: DATABASE_URL no está seteada.')

  const allowedHost = process.env.SEED_ALLOWED_DB_HOST
  if (!allowedHost) {
    throw new Error('seed-documentos.ts: falta SEED_ALLOWED_DB_HOST (mismo guard que db:seed).')
  }

  const actualHost = new URL(rawUrl).hostname
  if (actualHost !== allowedHost) {
    throw new Error(
      `seed-documentos.ts: DATABASE_URL apunta a "${actualHost}", no a la base de desarrollo esperada ` +
        `("${allowedHost}"). Abortado.`,
    )
  }
}

async function main() {
  assertNotProduction()

  for (const slug of SLUGS) {
    const [club] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.slug, slug))
      .limit(1)
    if (!club) {
      console.warn(`✖ No existe el club ${slug} (corré primero npm run db:seed).`)
      continue
    }
    await sembrarClub(club.id)
    console.log(`✔ ${club.name} (${club.slug}) · ${DEFAULT_TIPOS.length} tipos de documento`)
  }

  console.log('\nListo.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
