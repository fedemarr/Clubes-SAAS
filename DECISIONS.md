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

### `audit()` no está enganchado en ningún Server Action todavía
`src/lib/audit/index.ts` existe y expone `createAuditor(tx, ctx)` → `audit(entity, entityId, action, diff)`, tal como pide el brief, pero ninguna action lo llama todavía (ni `registrarUsuario`, ni `reenviarVerificacion`, ni el resto). Hoy no se escribe ningún registro en `audit_log` en ningún flujo real. Falta engancharlo en cada Server Action que escribe datos, empezando por `registro/actions.ts`, antes de apoyarse en la regla no negociable 8 ("todo queda auditado").
