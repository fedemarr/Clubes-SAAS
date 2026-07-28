/**
 * Núcleo multi-tenant — sistema de gestión de clubes deportivos
 *
 * Reglas no negociables:
 *  - Toda tabla de dominio lleva club_id. Sin excepciones.
 *  - Nada se borra: deleted_at (soft delete).
 *  - El dinero nunca se edita: ledger_entries es append-only, se contrasienta.
 *  - Lo específico de cada deporte vive en clubs.sport_pack (JSONB), no en el código.
 *
 * Postgres 16 + Drizzle ORM
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/* ────────────────────────────── enums ────────────────────────────── */

export const personStatus = pgEnum('person_status', [
  'prospecto',
  'pendiente_aprobacion',
  'activo',
  'inactivo',
  'baja',
])

export const roleKind = pgEnum('role_kind', [
  'jugador',
  'tutor',
  'entrenador',
  'manager',
  'coordinador',
  'preparador_fisico',
  'medico',
  'secretaria',
  'tesorero',
  'presidente',
  'directivo',
  'empleado',
  'socio_no_deportivo',
])

export const relationshipKind = pgEnum('relationship_kind', [
  'tutor_de',
  'conyuge_de',
  'hermano_de',
])

export const membershipStatus = pgEnum('membership_status', [
  'pendiente',
  'activa',
  'suspendida',
  'baja',
])

export const chargeStatus = pgEnum('charge_status', [
  'pendiente',
  'parcial',
  'pagado',
  'vencido',
  'anulado',
])

export const paymentMethod = pgEnum('payment_method', [
  'efectivo',
  'transferencia',
  'debito_automatico',
  'mercado_pago',
  'tarjeta',
  'ajuste',
])

export const paymentStatus = pgEnum('payment_status', [
  'pendiente',
  'acreditado',
  'rechazado',
  'reversado',
])

export const entryDirection = pgEnum('entry_direction', ['debito', 'credito'])

export const eventKind = pgEnum('event_kind', [
  'entrenamiento',
  'partido',
  'evento_social',
  'asamblea',
  'turno_voluntario',
])

export const participationStatus = pgEnum('participation_status', [
  'convocado',
  'presente',
  'ausente',
  'justificado',
  'lesionado',
])

export const documentKind = pgEnum('document_kind', [
  'apto_medico',
  'dni',
  'consentimiento_imagen',
  'consentimiento_tutor',
  'seguro',
  'ficha_federativa',
  'otro',
])

export const documentStatus = pgEnum('document_status', [
  'pendiente',
  'vigente',
  'vencido',
  'rechazado',
])

/* ───────────────────────── tenant + identidad ───────────────────────── */

/**
 * El tenant. Todo lo visual y lo específico del deporte sale de acá,
 * nunca del código: logo, colores, nombre, divisiones, posiciones.
 */
export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 60 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    locality: varchar('locality', { length: 120 }),
    logoUrl: text('logo_url'),
    branding: jsonb('branding').$type<{
      primary?: string
      secondary?: string
      tagline?: string
    }>(),
    /** Divisiones, posiciones, tipos de evento y estadísticas por deporte. */
    sportPack: jsonb('sport_pack').$type<Record<string, unknown>>(),
    timezone: varchar('timezone', { length: 60 })
      .notNull()
      .default('America/Argentina/Buenos_Aires'),
    currency: varchar('currency', { length: 3 }).notNull().default('ARS'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('clubs_slug_uq').on(t.slug)],
)

/** Credencial de acceso. Global: la misma persona puede estar en varios clubes. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
)

/**
 * La entidad central. Una persona, muchos roles.
 * El mismo registro es socio, jugador, padre, entrenador y directivo.
 */
export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    userId: uuid('user_id').references(() => users.id),
    docType: varchar('doc_type', { length: 12 }).notNull().default('DNI'),
    docNumber: varchar('doc_number', { length: 20 }),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    lastName: varchar('last_name', { length: 80 }).notNull(),
    bornOn: date('born_on'),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 40 }),
    photoUrl: text('photo_url'),
    memberNumber: integer('member_number'),
    status: personStatus('status').notNull().default('pendiente_aprobacion'),
    /** Campos propios de cada club. Nunca agregar columnas por cliente. */
    custom: jsonb('custom').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('persons_club_doc_uq').on(t.clubId, t.docNumber),
    uniqueIndex('persons_club_member_no_uq').on(t.clubId, t.memberNumber),
    index('persons_club_idx').on(t.clubId),
    index('persons_user_idx').on(t.userId),
    index('persons_lastname_idx').on(t.clubId, t.lastName),
  ],
)

/**
 * Roles con vigencia: el historial completo sale de acá sin escribir código extra.
 * scopeTeamId acota el rol a una categoría (entrenador de M16, no "entrenador").
 */
export const personRoles = pgTable(
  'person_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    role: roleKind('role').notNull(),
    scopeTeamId: uuid('scope_team_id'),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('person_roles_person_idx').on(t.personId),
    index('person_roles_club_role_idx').on(t.clubId, t.role),
  ],
)

/** Vínculos familiares. Sostienen el permiso del padre sobre el hijo. */
export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    relatedPersonId: uuid('related_person_id').notNull().references(() => persons.id),
    kind: relationshipKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('relationships_uq').on(t.personId, t.relatedPersonId, t.kind),
    index('relationships_related_idx').on(t.relatedPersonId),
  ],
)

/* ──────────────────────────── deportivo ──────────────────────────── */

/** Categorías y planteles. Definidas por año de nacimiento, no por edad. */
export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    sport: varchar('sport', { length: 40 }).notNull(),
    label: varchar('label', { length: 60 }).notNull(),
    season: integer('season').notNull(),
    birthYearFrom: integer('birth_year_from'),
    birthYearTo: integer('birth_year_to'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('teams_club_label_season_uq').on(t.clubId, t.sport, t.label, t.season),
    index('teams_club_idx').on(t.clubId),
  ],
)

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    teamId: uuid('team_id').notNull().references(() => teams.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    position: varchar('position', { length: 40 }),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
  },
  (t) => [
    index('team_members_team_idx').on(t.teamId),
    index('team_members_person_idx').on(t.personId),
  ],
)

/**
 * Un solo motor de eventos: entrenamiento, partido, cena, asamblea,
 * turno de buffet. Todo lo que tiene fecha y gente que asiste.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    teamId: uuid('team_id').references(() => teams.id),
    kind: eventKind('kind').notNull(),
    title: varchar('title', { length: 160 }),
    location: varchar('location', { length: 160 }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    opponent: varchar('opponent', { length: 120 }),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('events_club_starts_idx').on(t.clubId, t.startsAt),
    index('events_team_idx').on(t.teamId),
  ],
)

/** Asistencia y convocatoria son el mismo registro en distinto estado. */
export const participations = pgTable(
  'participations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    eventId: uuid('event_id').notNull().references(() => events.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    status: participationStatus('status').notNull().default('convocado'),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('participations_uq').on(t.eventId, t.personId),
    index('participations_person_idx').on(t.personId),
  ],
)

/* ───────────────────────────── finanzas ───────────────────────────── */

/**
 * Cuenta corriente del grupo familiar, no de la persona.
 * Un padre con tres hijos tiene una sola cuenta y un solo aviso de deuda.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    holderPersonId: uuid('holder_person_id').notNull().references(() => persons.id),
    label: varchar('label', { length: 120 }),
    /** CVU o alias virtual propio: hace que la transferencia concilie sola. */
    virtualCvu: varchar('virtual_cvu', { length: 30 }),
    virtualAlias: varchar('virtual_alias', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('accounts_club_idx').on(t.clubId),
    uniqueIndex('accounts_cvu_uq').on(t.virtualCvu),
  ],
)

/** Precio versionado. Nunca un campo `precio` suelto: con inflación se pierde la historia. */
export const feePlans = pgTable(
  'fee_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    name: varchar('name', { length: 100 }).notNull(),
    sport: varchar('sport', { length: 40 }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    /** Descuento acumulativo por hermano: [0, 20, 40] = 2º hermano 20% off, 3º 40%. */
    siblingDiscounts: jsonb('sibling_discounts').$type<number[]>(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fee_plans_club_idx').on(t.clubId, t.validFrom)],
)

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    feePlanId: uuid('fee_plan_id').notNull().references(() => feePlans.id),
    status: membershipStatus('status').notNull().default('pendiente'),
    startedOn: date('started_on').notNull(),
    endedOn: date('ended_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('memberships_account_idx').on(t.accountId),
    index('memberships_person_idx').on(t.personId),
    index('memberships_club_status_idx').on(t.clubId, t.status),
  ],
)

/** Devengado: la cuota del mes. Se genera automáticamente, no a mano. */
export const charges = pgTable(
  'charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    membershipId: uuid('membership_id').references(() => memberships.id),
    period: varchar('period', { length: 7 }).notNull(),
    concept: varchar('concept', { length: 160 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    dueOn: date('due_on').notNull(),
    status: chargeStatus('status').notNull().default('pendiente'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('charges_membership_period_uq').on(t.membershipId, t.period, t.concept),
    index('charges_account_status_idx').on(t.accountId, t.status),
    index('charges_club_due_idx').on(t.clubId, t.dueOn),
  ],
)

/** Percibido. externalRef es la clave de la conciliación automática. */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    accountId: uuid('account_id').references(() => accounts.id),
    method: paymentMethod('method').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    status: paymentStatus('status').notNull().default('pendiente'),
    externalRef: varchar('external_ref', { length: 120 }),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    recordedBy: uuid('recorded_by').references(() => users.id),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_external_ref_uq').on(t.clubId, t.externalRef),
    index('payments_account_idx').on(t.accountId),
    index('payments_unreconciled_idx').on(t.clubId, t.reconciledAt),
  ],
)

/**
 * Append-only. Nunca UPDATE, nunca DELETE.
 * Un error se corrige con un asiento inverso apuntando a reversesEntryId.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    direction: entryDirection('direction').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    chargeId: uuid('charge_id').references(() => charges.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    reversesEntryId: uuid('reverses_entry_id'),
    memo: varchar('memo', { length: 200 }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_account_booked_idx').on(t.accountId, t.bookedAt),
    index('ledger_club_booked_idx').on(t.clubId, t.bookedAt),
  ],
)

/* ────────────────────── documentos y auditoría ────────────────────── */

/** Aptos médicos con vencimiento: el motor de alertas sale de expiresOn. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    personId: uuid('person_id').notNull().references(() => persons.id),
    kind: documentKind('kind').notNull(),
    fileKey: text('file_key').notNull(),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    status: documentStatus('status').notNull().default('pendiente'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_person_idx').on(t.personId),
    index('documents_club_expires_idx').on(t.clubId, t.expiresOn),
  ],
)

/** Quién tocó qué. En un club con comisión directiva rotativa no es opcional. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    entity: varchar('entity', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    action: varchar('action', { length: 30 }).notNull(),
    diff: jsonb('diff').$type<Record<string, unknown>>(),
    ip: varchar('ip', { length: 45 }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_club_at_idx').on(t.clubId, t.at)],
)
