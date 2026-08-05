import { eq, sql } from 'drizzle-orm'
import { db } from './client'
import { clubs } from './schema'
import { withTenant } from './tenant'

/**
 * Reglas y plantillas por defecto del motor de cobranza (M5), para que el
 * motor tenga algo que correr desde el día 1. Idempotente: las plantillas
 * se sobrescriben por (club_id, key) y las reglas se actualizan por nombre,
 * nunca se duplican. Seguro de correr varias veces contra la base compartida.
 */

const DEFAULT_TEMPLATES = [
  {
    key: 'recordatorio_amable',
    name: 'Recordatorio amable',
    body: 'Hola {{nombre}}, te escribimos de {{club}}. Tu cuenta tiene una deuda de {{monto}}. Apenas puedas, acercate a tesorería para regularizar. ¡Gracias!',
  },
  {
    key: 'aviso_mail',
    name: 'Aviso por mail',
    body: 'Hola {{nombre}}, te recordamos que tu cuenta de {{club}} tiene una deuda de {{monto}}. Para regularizar tu situación, respondé este correo o acercate a tesorería. Saludos.',
  },
] as const

const DEFAULT_RULES = [
  {
    name: 'Recordatorio amable',
    dias: 5,
    channel: 'whatsapp',
    templateKey: 'recordatorio_amable',
    dedupeDias: 7,
  },
  {
    name: 'Aviso por mail',
    dias: 15,
    channel: 'mail',
    templateKey: 'aviso_mail',
    dedupeDias: 7,
  },
  {
    name: 'Derivación a coordinador',
    dias: 30,
    channel: 'coordinador',
    templateKey: null,
    dedupeDias: 15,
  },
  {
    name: 'Sugerencia de suspensión',
    dias: 60,
    channel: 'suspension',
    templateKey: null,
    dedupeDias: 30,
  },
] as const

const SLUGS = ['los-cedros', 'demo-fc']

async function sembrarClub(clubId: string) {
  await withTenant(clubId, async ({ tx }) => {
    for (const t of DEFAULT_TEMPLATES) {
      await tx.execute(sql`
        INSERT INTO message_templates (club_id, key, name, body)
        VALUES (${clubId}, ${t.key}, ${t.name}, ${t.body})
        ON CONFLICT (club_id, key) DO UPDATE
        SET name = EXCLUDED.name, body = EXCLUDED.body, updated_at = now()
      `)
    }

    for (const r of DEFAULT_RULES) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        SELECT id FROM cobranza_rules WHERE club_id = ${clubId} AND name = ${r.name}
      `)
      if (rows[0]) {
        await tx.execute(sql`
          UPDATE cobranza_rules
          SET dias_desde_vencimiento = ${r.dias}, channel = ${r.channel},
              template_key = ${r.templateKey}, dedupe_dias = ${r.dedupeDias}, enabled = true
          WHERE id = ${rows[0].id}
        `)
      } else {
        await tx.execute(sql`
          INSERT INTO cobranza_rules (club_id, name, dias_desde_vencimiento, channel, template_key, dedupe_dias, enabled)
          VALUES (${clubId}, ${r.name}, ${r.dias}, ${r.channel}, ${r.templateKey}, ${r.dedupeDias}, true)
        `)
      }
    }
  })
}

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-morosidad.ts: NODE_ENV=production. Abortado.')
  }

  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) throw new Error('seed-morosidad.ts: DATABASE_URL no está seteada.')

  const allowedHost = process.env.SEED_ALLOWED_DB_HOST
  if (!allowedHost) {
    throw new Error('seed-morosidad.ts: falta SEED_ALLOWED_DB_HOST (mismo guard que db:seed).')
  }

  const actualHost = new URL(rawUrl).hostname
  if (actualHost !== allowedHost) {
    throw new Error(
      `seed-morosidad.ts: DATABASE_URL apunta a "${actualHost}", no a la base de desarrollo esperada ` +
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
    console.log(`✔ ${club.name} (${club.slug}) · ${DEFAULT_TEMPLATES.length} plantillas + ${DEFAULT_RULES.length} reglas`)
  }

  console.log('\nListo.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
