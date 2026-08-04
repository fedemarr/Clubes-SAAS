# Decisiones técnicas

> Ambigüedades técnicas dentro del stack cerrado (sección 3 de `CLAUDE.md`), decididas y documentadas acá en vez de preguntadas, según la sección 13.6 del brief.

## M0 · Fundaciones

### Next.js 15, no 16
`create-next-app@latest` instala Next 16 por default a esta fecha. `CLAUDE.md` fija explícitamente "Next.js 15" en el stack cerrado, así que se bajó a la última `15.x` (`15.5.22`) después del scaffold, junto con `eslint-config-next@15.5.22`.

### Driver de Postgres: `@neondatabase/serverless` (`Pool`/WebSocket), no `pg` ni `neon-http`
`withTenant()` (sección 6 del brief) necesita una transacción real con `SET LOCAL app.current_club` por request. El driver HTTP de Neon (`neon-http`) no sostiene sesión ni transacción entre queries; `pg` puro funciona pero no está pensado para el modelo de conexión serverless de Vercel. `Pool` de `@neondatabase/serverless` sí sostiene transacciones reales y es el recomendado por Neon para funciones serverless.

### Middleware en runtime Node, no Edge
El middleware necesita resolver el club y validar el `person_role` vigente contra la base, usando el mismo `Pool`/`withTenant()` que el resto de la app. Runtime Edge no soporta ese driver. En Next 15.5 el runtime Node de middleware ya es estable y no necesita flag en `next.config.ts`: alcanza con `export const config = { runtime: 'nodejs' }` en `src/middleware.ts`.

### Auth.js v5 sin adapter — sesión JWT stateless
`schema.ts` no tiene tablas `accounts`/`sessions`/`verification_tokens` (y no se puede modificar el schema), así que no hay adapter de Auth.js. La sesión usa estrategia JWT. La verificación de email y el magic link se resuelven con tokens firmados de corta vida (`jose`, HS256, 30 min), no con una tabla de tokens.

**Trade-off:** esos tokens no se pueden revocar del lado del servidor antes de que expiren — si alguien captura el link, sigue siendo válido hasta los 30 minutos. Aceptable para el MVP. Si más adelante hace falta revocación o un solo uso estricto, la solución es agregar una tabla `email_tokens` (fuera de `schema.ts`, en un archivo aparte) y decidirlo explícitamente en ese momento.

### `bcryptjs` en vez de `bcrypt`
`bcrypt` requiere compilación nativa; `bcryptjs` es puro JS y evita fricción en Windows y en el build de Vercel.

### `@faker-js/faker` solo en el seed
DevDependency, usada únicamente en `src/db/seed.ts` para generar nombres, DNI y fechas de nacimiento de las 40 personas de prueba por club. No se usa en runtime de la app.

### `app_user` sí se creó en M0 (reemplaza la decisión original de dejarlo afuera)
La idea inicial era correr todo con el owner de Neon durante M0, confiando en que `FORCE ROW LEVEL SECURITY` alcanzaría para proteger incluso al dueño de las tablas. Se verificó contra la base real (`select rolbypassrls from pg_roles where rolname = current_user`) y el rol `neondb_owner` de Neon tiene `rolbypassrls = true`: bypassea RLS por completo, sin importar `FORCE`. Con eso, el criterio de aceptación de M0 ("una query sin `set_config` devuelve cero filas") no se cumplía — el aislamiento dependía 100% del código de la app.

Se avisó y se decidió crear `app_user` ya en M0. `rls.sql` lo define `NOLOGIN` (pensado como rol de grupo); como hace falta que la app se conecte directamente, `src/db/create-app-user.ts` (con `DATABASE_URL_OWNER`) le aplica los mismos `GRANT`s de la sección 1 de `rls.sql` y le agrega `LOGIN PASSWORD` (la password no se commitea, se genera por entorno). La password no vive en `rls.sql` a propósito.

Dos connection strings en `.env.local`:
- `DATABASE_URL` → `app_user`, la usa el runtime de la app y el seed. Sujeto a RLS de verdad (`rolbypassrls = false`, verificado).
- `DATABASE_URL_OWNER` → owner de Neon, solo para `drizzle-kit generate/migrate` y `apply-rls.ts` (crear tablas y políticas requiere ser owner).

Verificado end-to-end contra la base real: sin `set_config`, `app_user` obtiene 0 filas de una tabla con `club_id` aunque haya datos; con `set_config` al club correcto, ve exactamente esas filas. Logueado como usuario de un club, forzar el dashboard del otro club da 404 (nunca 403).

### Sin el paquete `ws` — Node 24 ya trae `WebSocket` nativo
El scaffold inicial configuraba `neonConfig.webSocketConstructor = ws` (paquete `ws`, más `bufferutil`/`utf-8-validate` como dependencias nativas opcionales). Al correr `next dev`, el middleware fallaba con `TypeError: bufferUtil.mask is not a function`: webpack bundlea el middleware y `bufferutil` (dependencia nativa opcional de `ws`, no instalada) queda resuelta como un stub roto. Como el entorno corre Node 24 (con `WebSocket` global estable), la solución fue sacar `ws`/`@types/ws` del todo: `@neondatabase/serverless` usa el `WebSocket` nativo sin que haya que configurar nada.

### `/recuperar` como stub
El alcance de M0 en `CLAUDE.md` pide "email + password y magic link, verificación de email obligatoria" — no menciona recuperación de contraseña. La pantalla existe (ruta y layout) pero la acción no está implementada, para no inflar el alcance del módulo.

### `eslint.config.mjs` con `FlatCompat`
`eslint-config-next@15.5.22` todavía exporta configuración legacy (`.eslintrc`-style), no arrays de flat config. El `eslint.config.mjs` que genera `create-next-app` (pensado para Next 16, que ya trae `eslint-config-next` en formato flat) no funciona tal cual contra la versión 15.x. Se resolvió con el puente estándar `FlatCompat` de `@eslint/eslintrc` (dependencia transitiva de `eslint`, ya presente).

### `/registro` solo crea credenciales, no `persons`
`users` no tiene `club_id` (es una tabla global). Vincular un usuario a una `person` de un club específico es la inscripción pública (`/[club]/inscripcion`), que es alcance de M1. El seed sí crea `users` + `persons` + `person_roles` ya vinculados para poder probar login, branding y aislamiento sin depender de M1.

## Pendiente (no bloquea M0, pero no está cerrado)

### Deploy a Vercel: primer deploy promovió directo a producción
El plan era probar en preview antes de producción, pero al ser el primer deploy del proyecto Vercel lo promovió directo a producción (comportamiento default cuando no hay un deploy de producción previo con el que comparar). Se probó de punta a punta ya en producción (`https://club-saas-xi.vercel.app`): login, branding por club, aislamiento cruzado (404) y club inexistente (404), todo contra la base real. `engines.node` quedó fijo en un valor exacto (no un rango abierto) para evitar el auto-upgrade silencioso de major que advierte Vercel — arrancó en `"22.x"` y después se subió a `"24.x"` (coincide con el Node local), confirmado por el log de build de Vercel ("Skipping build cache since Node.js version changed from 22.x to 24.x"). `NEXT_PUBLIC_APP_URL` de producción apunta al dominio real; `RESEND_API_KEY` sigue sin configurar (decisión explícita), así que los mails de verificación/magic link en producción solo quedan en los logs de la función hasta que se cargue una key real.

## Separación dev/producción

### Región: Vercel alineado con Neon
Neon corre en `sa-east-1` (São Paulo, AWS). Las funciones de Vercel corrían por default en `iad1` (Washington DC, US East) — confirmado empíricamente con el header `X-Vercel-Id` (`gru1::iad1::...`, edge en gru1 pero función ejecutando en iad1). Se agregó `vercel.json` con `"regions": ["gru1"]` (São Paulo, la región de Vercel más cercana a `sa-east-1`). Verificado post-deploy: `X-Vercel-Id` pasó a `gru1::gru1::...`, función y base ya en la misma región.

### Bases separadas: un proyecto de Neon por ambiente
Hasta ahora producción y desarrollo usaban el mismo proyecto de Neon (con usuarios de seed y password conocida `Cambiar123!`). Antes de cargar datos reales de un club, esto tiene que separarse. El patrón:

- **`.env.local`** (git-ignored, como siempre): apunta al proyecto de Neon de **desarrollo**. Lo usan `next dev`, `db:seed`, `db:migrate`, `db:rls`, `db:create-app-user`, y `test` (el test de concurrencia corre contra dev).
- **`.env.production.local`** (nuevo, git-ignored — ya cubierto por el patrón `.env*.local` existente en `.gitignore`): apunta al proyecto de Neon de **producción**. Se usa solo para las tareas administrativas puntuales de producción (migrar, aplicar `rls.sql`, crear `app_user`), nunca para levantar la app localmente ni para seed.
- **Vercel**: la env var `DATABASE_URL` de **Production** apunta al Neon de producción; la de **Preview** sigue apuntando al Neon de **desarrollo** (así los preview deploys de ramas/PRs nunca tocan datos reales). `DATABASE_URL_OWNER` **no se carga en Vercel bajo ningún ambiente** — el owner (con `BYPASSRLS`) no tiene que existir nunca en un entorno con tráfico público; las migraciones se corren desde una máquina local contra `.env.production.local`.

Nuevos scripts (mismo código, apuntan a otro archivo de env):
- `db:migrate:prod` (usa `drizzle.config.prod.ts`, que carga `.env.production.local`)
- `db:rls:prod`
- `db:create-app-user:prod`
- Deliberadamente **no existe** `db:seed:prod` — el seed nunca debe correr contra producción, ver el punto siguiente.

### `seed.ts` se niega a correr fuera de dev
`assertNotProduction()` corre primero que nada en `main()`, con dos chequeos independientes:
1. Aborta si `NODE_ENV === 'production'`.
2. Aborta si `SEED_ALLOWED_DB_HOST` no está seteada, o si el hostname real de `DATABASE_URL` no coincide con ella.

## Auditoría en dos niveles

Razón: la trazabilidad de los datos tiene que ser imposible de evadir, incluso si alguien saltea la app (un fix a mano en Drizzle Studio, un script de soporte, una migración que toca datos).

**Nivel 1 — Semántica de negocio (app).** Server Actions llaman a `audit(entity, entityId, action, diff)` para registrar qué pasó en términos del dominio, no solo qué columnas cambiaron. Ejemplo: "aprobó el alta de Juan", "condonó la deuda de la familia X". Viene inyectado en el contexto de `withTenant()` — `{ tx, audit }` — así que corre siempre dentro de la misma transacción que el cambio que audita, nunca aparte. `action` está tipado a `'create' | 'update' | 'delete' | 'custom'`.

**Nivel 2 — Trazabilidad estructural (Postgres).** Trigger genérico (`audit_table_changes()`, en `rls.sql`) en cada tabla de dominio listada abajo. Registra automáticamente qué columnas cambiaron, sin que ninguna Server Action tenga que acordarse de llamar a nada. Corre incluso si el cambio se hizo con SQL directo. Probado en vivo (ver más abajo): crear una persona, actualizar un rol y borrar un vínculo generaron sus filas correctas en `audit_log` sin que el test llamara a `audit()` ni una vez.

Los dos niveles escriben a la misma tabla `audit_log` y leen exactamente los mismos `current_setting()` (`app.current_club`, `app.current_actor`, `app.current_batch`) que setea `withTenant()`, así que una fila escrita a mano y las que genera el trigger son consistentes entre sí — no hay dos fuentes de verdad para "quién" o "en qué club".

**Tablas con el trigger:** `persons`, `person_roles`, `relationships`, `memberships`, `fee_plans`, `charges`, `payments`, `documents`.

**Tablas explícitamente afuera:** `audit_log` (recursión) y `ledger_entries` (ya es append-only con su propio trigger, sección 4 de `rls.sql`). También quedan afuera, a criterio explícito de esta ronda, otras tablas con `club_id` que no forman parte de esta lista (`teams`, `team_members`, `accounts`, `events`, `participations`) — no es un olvido, es alcance acotado a lo pedido; revisar cuando esos módulos (M2, M4) se construyan.

**Batching.** Una importación masiva (700 personas de padrón, M1) genera 700 filas de auditoría — una por persona, eso es correcto, no es ruido: es trazabilidad real por fila. Lo que agrupa esas 700 filas para que la UI no sea un muro de líneas sueltas es `app.current_batch`, un UUID opcional que `withTenant()` acepta como cuarto parámetro y que viaja igual que `app.current_club`. Ejemplo de uso futuro en el importador de M1: `withTenant(clubId, fn, actor, batchId)`. La UI de auditoría (M8) puede entonces mostrar "700 personas importadas en el lote `ABC123` — ver detalle" en vez de 700 líneas.

**Performance.** El trigger es *row-level* pero corre dentro del mismo backend de Postgres — no agrega ida y vuelta de red por fila, esa es la diferencia con hacer 700 llamados separados desde la app. Por fila agrega: construir el diff en jsonb (barato) + un INSERT extra a `audit_log` (fila chica, un solo índice btree a mantener). Estimado razonado para 700 filas: +50-70% de tiempo de escritura del lado del servidor sobre la operación total, pero en términos absolutos del orden de decenas a un par de cientos de milisegundos para todo el lote, no cientos de ms por fila — esto es una estimación, no una medición; benchmarkear con datos reales cuando se construya el importador de M1, antes de meter datos de verdad en producción.

**Asimetrías intencionales:**
- `batch_id` vive en SQL (`rls.sql`), no en `schema.ts`. Es infraestructura de auditoría, no dominio — mismo criterio que ya aplica a la vista `account_balances` o al trigger de `ledger_entries`, ninguno de los dos existe en `schema.ts` tampoco. Consecuencia: `auditLog` (Drizzle, tipado desde `schema.ts`) no tiene `batchId` como columna; para leerlo o escribirlo hay que usar SQL crudo (`tx.execute(sql\`...\`)`), que es justo lo que hace `createAuditor`.
- El auditor de nivel 1 (`createAuditor` en `src/lib/audit/index.ts`) inserta con SQL crudo en vez del builder tipado de Drizzle, a propósito: `club_id`/`actor_user_id`/`ip`/`batch_id` se derivan de los mismos `current_setting()` que lee el trigger, no de valores JS pasados por parámetro — una sola fuente de verdad para "quién y dónde", en vez de mantener el contexto sincronizado en dos lugares.
- El auditor de nivel 1 es idempotente dentro de una misma transacción: si se llama dos veces con exactamente los mismos `(entity, entityId, action, diff)`, la segunda llamada no inserta fila (deduplicado en memoria por instancia de auditor, que vive por transacción). Probado en vivo.

**Hallazgo importante — el trigger bloquea escrituras sin `app.current_club`.** Al limpiar datos de una prueba con un script administrativo que usaba la conexión de owner directo (sin pasar por `withTenant`), un `DELETE` sobre `person_roles` falló con `null value in column "club_id" of relation "audit_log" violates not-null constraint`: el trigger intentó escribir la fila de auditoría, `current_club()` devolvió `NULL` (nadie seteó el setting), y `audit_log.club_id` es `NOT NULL`. Esto es un trade-off real, no un bug: **cualquier INSERT/UPDATE/DELETE sobre las 8 tablas auditadas ahora requiere que `app.current_club` esté seteado**, incluidos scripts de administración, arreglos a mano y (a futuro) migraciones que toquen datos de esas tablas. Es la contracara de "imposible de evadir" — se pagó con que ya no se puede tocar esas tablas "a mano" sin pasar por `withTenant()` (o setear el contexto manualmente). Documentado acá para que no sorprenda la próxima vez.

**Verificación en vivo (ver historial de la sesión):** se creó una persona, se le agregó y actualizó un rol, y se creó y borró un vínculo `hermano_de` — sin llamar a `audit()` en ningún momento. Las 5 filas resultantes en `audit_log` (create de persons, create+update de person_roles, create+delete de relationships) tenían diffs correctos: el `create` de `persons` solo con columnas de negocio (sin `id`/`club_id`/`created_at`/etc.), el `update` de `person_roles` solo con `{"valid_to": "2026-12-31"}` (no la fila entera), y el `delete` de `relationships` con `diff: null`. `actor_user_id`, `ip` y `batch_id` viajaron correctamente en los casos donde se pasó `actor`/`batchId` a `withTenant`, y `null` donde no. Por separado, se probó `audit()` de nivel 1 llamado dos veces con los mismos parámetros: escribió una sola fila.

`SEED_ALLOWED_DB_HOST` solo se define en `.env.local` (con el hostname exacto del Neon de desarrollo). Nunca se define en `.env.production.local` ni en Vercel — así que aunque alguien corra `seed.ts` a mano apuntando por error a producción, el script aborta antes de tocar una sola fila. Probado en vivo: los tres modos de falla (NODE_ENV=production, variable ausente, host equivocado) abortan correctamente antes de cualquier query; con la config correcta, pasa el chequeo sin problema.

## M2 · Deportivo (calendario)

### Recurrencia de entrenamientos: filas materializadas, no expandir on-the-fly

Cuando un entrenamiento es recurrente (semanal), se materializan N filas en `events` (una por semana hasta `until`). Cada fila comparte un `meta.recurrence.seriesId` y es independiente: se puede editar o eliminar individualmente sin afectar al resto.

Razón: `participations` es una tabla pivote por evento — la asistencia se toma por cada fila de `events`, no por serie. Materializar evita expandir la recurrencia cada vez que alguien abre un evento o la pantalla de asistencia, y permite que cada entrenamiento de la serie tenga su propio estado de asistencia.

Límite: `RECURRENCIA_MAX_SEMANAS = 52`. Más allá se rechaza al crear.

### `scopeTeamIds` en `PermissionContext`

`requirePermission` ahora devuelve `scopeTeamIds: string[]`, derivado de los `person_role.scopeTeamId` del actor. La regla:

- Array vacío → el actor tiene al menos un rol de alcance club (presidente, secretaria, tesorero) → ve todo del club.
- Array con IDs → el actor solo tiene roles con scopeTeamId (manager, entrenador, coordinador) → solo ve y opera sobre los teams de ese alcance.

Las páginas usan `ctx.scopeTeamIds` para filtrar datos y restringir acciones. Si un usuario team-scoped intenta acceder a un evento fuera de su scope, se devuelve `notFound()` (nunca 403).

### Calendario: visibilidad por team-scope

Las acciones de escritura (crear/actualizar/eliminar) validan el scopeTeamIds contra el teamId del evento. Un manager no puede crear un evento "del club" (sin categoría); eso requiere un rol club-wide. Un evento creado por comisión (teamId null) no es visible a managers/entrenadores.

### Notificaciones de convocatoria (pendiente, M2.2)

Se decidió construir una tabla `notifications` fuera de `schema.ts` (precedente: `email_tokens` mencionado en DECISIONS de M0) con un emisor que persiste y loguea. Los canales (WhatsApp, mail, push) se agregan en M5-M6. Esto fue confirmado en la decisión de diseño para M2.2 convocatoria.

## Base de dise�o (antes de M3)

### shadcn/ui + tokens de marca desde clubs.branding

Se instal� shadcn/ui sobre Tailwind v4 (el CLI usa la variante Base UI de los componentes: Button con prop ender en vez de sChild). Los tokens quedan en globals.css en formato oklch.

La marca del club se inyecta en src/lib/theme.ts (randTokens): a partir de clubs.branding.primary (hex) se derivan --primary, --primary-foreground (contraste por luminancia relativa), --ring, --accent (tint al 10% con color-mix) y los vars de sidebar. Se aplican como CSS vars en el wrapper del layout (app)/[club], as� el sub�rbol del tenant hereda la marca sin tocar c�digo por club (regla 2). Los colores con significado (rojo=deuda/vencido, verde=al d�a) siguen siendo expl�citos en cada componente, nunca se derivan de la marca.

El resto de las p�ginas (formularios de M1/M2.1, pantallas mobile de asistencia/convocatoria) se migran de a una a medida que se tocan, sin romperlas: primero las listas visibles (calendario, padr�n) y el dashboard.

## M3 � Cuotas y cuenta corriente

### `account_balances` como vista con `SECURITY INVOKER`

La vista se definió en `rls.sql` (sección 5) como vista simple, lo que la hace `SECURITY DEFINER` por default: corría con permisos del owner y **no aplicaba RLS**, devolviendo el saldo agregado de todos los clubes a cualquiera (fuga de datos entre tenants, vía `app_user`). Se le agregó `WITH (security_invoker = true)` para que evalúe RLS de las tablas subyacentes con el rol del llamador (`app_user`).

Verificado contra dev real: sin `set_config` devuelve 0 filas; con `withTenant`, cada club ve solo sus propias `account_balances`. Requiere correr `npm run db:rls` por ambiente (la vista ya está creada; `apply-rls.ts` reaplica la definición).
