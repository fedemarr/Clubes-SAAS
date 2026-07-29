import { faker } from '@faker-js/faker'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { withTenant } from './tenant'
import {
  accounts,
  clubs,
  feePlans,
  memberships,
  personRoles,
  persons,
  relationships,
  teams,
  users,
} from './schema'

const SEED_PASSWORD = 'Cambiar123!'
const FAMILY_KID_COUNTS = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]

type CategoryConfig = {
  label: string
  birthYearFrom: number
  birthYearTo: number
}

type SportConfig = {
  sport: string
  season: number
  categories: CategoryConfig[]
  feePlan: { name: string; amount: string; siblingDiscounts: number[] }
}

type ClubSeedConfig = {
  slug: string
  name: string
  locality: string
  branding: { primary: string; secondary: string; tagline: string }
  sportPack: Record<string, unknown>
  sports: SportConfig[]
}

const CLUBES: ClubSeedConfig[] = [
  {
    slug: 'los-cedros',
    name: 'Club Los Cedros',
    locality: 'Los Polvorines, Buenos Aires',
    branding: { primary: '#1F5C3F', secondary: '#E7B740', tagline: 'Rugby y hockey de Los Polvorines' },
    sportPack: {
      rugby: { posiciones: ['pilar', 'hooker', 'segunda línea', 'ala', 'octavo', 'medio scrum', 'apertura', 'centro', 'wing', 'fullback'] },
      hockey: { posiciones: ['arquera', 'defensora', 'volante', 'delantera'] },
    },
    sports: [
      {
        sport: 'rugby',
        season: 2026,
        categories: [
          { label: 'M8', birthYearFrom: 2018, birthYearTo: 2018 },
          { label: 'M10', birthYearFrom: 2016, birthYearTo: 2016 },
          { label: 'M12', birthYearFrom: 2014, birthYearTo: 2014 },
          { label: 'M14', birthYearFrom: 2012, birthYearTo: 2012 },
          { label: 'M16', birthYearFrom: 2010, birthYearTo: 2010 },
          { label: 'M19', birthYearFrom: 2008, birthYearTo: 2008 },
        ],
        feePlan: { name: 'Cuota Rugby', amount: '65000.00', siblingDiscounts: [0, 20, 40] },
      },
      {
        sport: 'hockey',
        season: 2026,
        categories: [
          { label: 'Sub10', birthYearFrom: 2016, birthYearTo: 2016 },
          { label: 'Sub12', birthYearFrom: 2014, birthYearTo: 2014 },
          { label: 'Sub14', birthYearFrom: 2012, birthYearTo: 2012 },
          { label: 'Sub16', birthYearFrom: 2010, birthYearTo: 2010 },
        ],
        feePlan: { name: 'Cuota Hockey', amount: '72000.00', siblingDiscounts: [0, 20, 40] },
      },
    ],
  },
  {
    slug: 'demo-fc',
    name: 'Demo FC',
    locality: 'Buenos Aires',
    branding: { primary: '#1E40AF', secondary: '#F97316', tagline: 'Club de fútbol de demostración' },
    sportPack: {
      futbol: { posiciones: ['arquero', 'defensor', 'mediocampista', 'delantero'] },
    },
    sports: [
      {
        sport: 'futbol',
        season: 2026,
        categories: [
          { label: 'Sub8', birthYearFrom: 2018, birthYearTo: 2018 },
          { label: 'Sub10', birthYearFrom: 2016, birthYearTo: 2016 },
          { label: 'Sub12', birthYearFrom: 2014, birthYearTo: 2014 },
          { label: 'Sub14', birthYearFrom: 2012, birthYearTo: 2012 },
          { label: 'Sub16', birthYearFrom: 2010, birthYearTo: 2010 },
        ],
        feePlan: { name: 'Cuota Fútbol', amount: '58000.00', siblingDiscounts: [0, 20, 40] },
      },
    ],
  },
]

const usedDocNumbers = new Set<string>()

function nextDocNumber(): string {
  let doc: string
  do {
    doc = faker.string.numeric(8)
  } while (usedDocNumbers.has(doc))
  usedDocNumbers.add(doc)
  return doc
}

async function seedClub(cfg: ClubSeedConfig) {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: cfg.slug,
      name: cfg.name,
      locality: cfg.locality,
      branding: cfg.branding,
      sportPack: cfg.sportPack,
    })
    .returning()

  if (!club) throw new Error(`No se pudo crear el club ${cfg.slug}`)

  const testUsers: { email: string; role: string; password: string }[] = []

  await withTenant(club.id, async ({ tx }) => {
    const seasonStart = `${cfg.sports[0]?.season ?? 2026}-01-01`

    type CategoryRow = { id: string; sport: string; birthYearFrom: number; birthYearTo: number }
    const allCategories: CategoryRow[] = []
    const feePlanBySport = new Map<string, { id: string; amount: string }>()

    for (const sport of cfg.sports) {
      const insertedTeams = await tx
        .insert(teams)
        .values(
          sport.categories.map((c) => ({
            clubId: club.id,
            sport: sport.sport,
            label: c.label,
            season: sport.season,
            birthYearFrom: c.birthYearFrom,
            birthYearTo: c.birthYearTo,
          })),
        )
        .returning()

      for (const t of insertedTeams) {
        allCategories.push({
          id: t.id,
          sport: t.sport,
          birthYearFrom: t.birthYearFrom ?? sport.categories[0]!.birthYearFrom,
          birthYearTo: t.birthYearTo ?? sport.categories[0]!.birthYearTo,
        })
      }

      const [plan] = await tx
        .insert(feePlans)
        .values({
          clubId: club.id,
          name: sport.feePlan.name,
          sport: sport.sport,
          amount: sport.feePlan.amount,
          siblingDiscounts: sport.feePlan.siblingDiscounts,
          validFrom: seasonStart,
        })
        .returning()

      if (plan) feePlanBySport.set(sport.sport, { id: plan.id, amount: plan.amount })
    }

    // Roles de conducción del club, fijos independientemente del deporte.
    const staffDefs: {
      role: 'presidente' | 'tesorero' | 'secretaria' | 'coordinador'
      scopeTeamId?: string
      emailSlug: string
    }[] = [
      { role: 'presidente', emailSlug: 'presidente' },
      { role: 'tesorero', emailSlug: 'tesorero' },
      { role: 'secretaria', emailSlug: 'secretaria' },
      ...cfg.sports.map((s) => ({
        role: 'coordinador' as const,
        scopeTeamId: allCategories.find((c) => c.sport === s.sport)?.id,
        emailSlug: cfg.sports.length > 1 ? `coordinador-${s.sport}` : 'coordinador',
      })),
    ]

    for (const staff of staffDefs) {
      const firstName = faker.person.firstName()
      const lastName = faker.person.lastName()
      const email = `${staff.emailSlug}@${cfg.slug}.test`

      const [person] = await tx
        .insert(persons)
        .values({
          clubId: club.id,
          docNumber: nextDocNumber(),
          firstName,
          lastName,
          bornOn: faker.date.birthdate({ min: 1970, max: 1995, mode: 'year' }).toISOString().slice(0, 10),
          email,
          phone: faker.phone.number(),
          status: 'activo',
        })
        .returning()

      if (!person) continue

      await tx.insert(personRoles).values({
        clubId: club.id,
        personId: person.id,
        role: staff.role,
        scopeTeamId: staff.scopeTeamId,
        validFrom: seasonStart,
      })

      const passwordHash = await hash(SEED_PASSWORD, 12)
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash, emailVerifiedAt: new Date() })
        .returning()

      if (user) {
        await tx.update(persons).set({ userId: user.id }).where(eq(persons.id, person.id))
        testUsers.push({ email, role: staff.role, password: SEED_PASSWORD })
      }
    }

    let familyIndex = 0
    for (const kidsInFamily of FAMILY_KID_COUNTS) {
      familyIndex += 1
      const familyLastName = faker.person.lastName()

      const tutorFirstName = faker.person.firstName()
      const tutorEmail = `tutor${familyIndex}@${cfg.slug}.test`
      const [tutor] = await tx
        .insert(persons)
        .values({
          clubId: club.id,
          docNumber: nextDocNumber(),
          firstName: tutorFirstName,
          lastName: familyLastName,
          bornOn: faker.date.birthdate({ min: 1975, max: 1995, mode: 'year' }).toISOString().slice(0, 10),
          email: tutorEmail,
          phone: faker.phone.number(),
          status: 'activo',
        })
        .returning()

      if (!tutor) continue

      await tx.insert(personRoles).values({
        clubId: club.id,
        personId: tutor.id,
        role: 'tutor',
        validFrom: seasonStart,
      })

      const [account] = await tx
        .insert(accounts)
        .values({ clubId: club.id, holderPersonId: tutor.id, label: `Familia ${familyLastName}` })
        .returning()

      if (!account) continue

      if (familyIndex <= 1) {
        const passwordHash = await hash(SEED_PASSWORD, 12)
        const [user] = await db
          .insert(users)
          .values({ email: tutorEmail, passwordHash, emailVerifiedAt: new Date() })
          .returning()
        if (user) {
          await tx.update(persons).set({ userId: user.id }).where(eq(persons.id, tutor.id))
          testUsers.push({ email: tutorEmail, role: 'tutor', password: SEED_PASSWORD })
        }
      }

      const siblingIds: string[] = []

      for (let i = 0; i < kidsInFamily; i++) {
        const category = faker.helpers.arrayElement(allCategories)
        const kidFirstName = faker.person.firstName()

        const [kid] = await tx
          .insert(persons)
          .values({
            clubId: club.id,
            docNumber: nextDocNumber(),
            firstName: kidFirstName,
            lastName: familyLastName,
            bornOn: faker.date
              .birthdate({ min: category.birthYearFrom, max: category.birthYearTo, mode: 'year' })
              .toISOString()
              .slice(0, 10),
            status: 'activo',
          })
          .returning()

        if (!kid) continue

        await tx.insert(personRoles).values({
          clubId: club.id,
          personId: kid.id,
          role: 'jugador',
          scopeTeamId: category.id,
          validFrom: seasonStart,
        })

        await tx.insert(relationships).values({
          clubId: club.id,
          personId: tutor.id,
          relatedPersonId: kid.id,
          kind: 'tutor_de',
        })

        const plan = feePlanBySport.get(category.sport)
        if (plan) {
          await tx.insert(memberships).values({
            clubId: club.id,
            personId: kid.id,
            accountId: account.id,
            feePlanId: plan.id,
            status: 'activa',
            startedOn: seasonStart,
          })
        }

        siblingIds.push(kid.id)
      }

      for (const a of siblingIds) {
        for (const b of siblingIds) {
          if (a === b) continue
          await tx.insert(relationships).values({
            clubId: club.id,
            personId: a,
            relatedPersonId: b,
            kind: 'hermano_de',
          })
        }
      }
    }
  })

  return { club, testUsers }
}

/**
 * Nunca puede correr contra producción. Dos chequeos independientes:
 * NODE_ENV (por si algún día esto se invoca desde algo que sí lo setea,
 * como una función de Vercel) y el hostname real de DATABASE_URL contra
 * un allowlist que solo existe en .env.local — nunca en
 * .env.production.local ni en Vercel. Si falta la variable o no matchea,
 * aborta. No hay forma de "confirmar y seguir": es todo o nada.
 */
function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed.ts: NODE_ENV=production. Abortado — el seed nunca corre en producción.')
  }

  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) {
    throw new Error('seed.ts: DATABASE_URL no está seteada.')
  }

  const allowedHost = process.env.SEED_ALLOWED_DB_HOST
  if (!allowedHost) {
    throw new Error(
      'seed.ts: falta SEED_ALLOWED_DB_HOST. Sin esa variable el seed se niega a correr, ' +
        'por seguridad (evita correrlo por accidente contra una base que no sea la de desarrollo).',
    )
  }

  const actualHost = new URL(rawUrl).hostname
  if (actualHost !== allowedHost) {
    throw new Error(
      `seed.ts: DATABASE_URL apunta a "${actualHost}", no a la base de desarrollo esperada ` +
        `("${allowedHost}"). Abortado.`,
    )
  }
}

async function main() {
  assertNotProduction()

  console.log('Sembrando clubes de prueba...\n')

  for (const cfg of CLUBES) {
    const { club, testUsers } = await seedClub(cfg)
    console.log(`✔ ${club.name} (${club.slug})`)
    for (const u of testUsers) {
      console.log(`  - ${u.role.padEnd(12)} ${u.email}  (contraseña: ${u.password})`)
    }
  }

  console.log('\nListo.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
