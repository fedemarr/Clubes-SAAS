## Objective
- **M6 · Portal del socio y del padre (brief)** casi completo: PWA (hecha), login unificado con desvío por rol (hecho), home con evento + estado de cuenta + pago MP (hecho), carnet con QR rotativo (hecho), notificaciones push (hechas: suscripción por socio + envío post-commit). Falta solo subida de documentos (se conecta con M7 — R2 + URLs firmadas). Portal pusheado en `331ecfc`; push en `6faae95`. M5 cerró en `6a16c2d`.

## Important Details
- **Deploy**: repo `https://github.com/fedemarr/Clubes-SAAS.git`, Vercel `fmcodes-projects/club-saas`, auto-deploy desde `main`. `origin/main` en `6faae95` (M6 push). Previos: `331ecfc` (M6 portal), `6a16c2d` (M5), `bb72c04`, `d55fc8a`, `6292e2b`, `31291fa`, `7b938ca`.
- **Base Neon única**: producción y dev comparten la misma base. Secciones 10–12 de RLS (`notifications`, `message_templates`, `cobranza_rules`, `contact_log`, `payment_plans`, `debito_lotes`, `push_subscriptions`) aplicadas. Seed M5 aplicado a los-cedros y demo-fc.
- **Credenciales seed**: password `Cambiar123!`; emails `<rol>@<slug>.test`; slugs `los-cedros`, `demo-fc`. En los-cedros solo `tutor1@los-cedros.test` tiene login de familia (cuenta "Familia O'Connell", saldo 0).
- **Regla de dinero**: cents vía `src/lib/money.ts` (`decimalToCents`/`centsToDecimal`/`formatARS`); base `numeric(14,2)`.
- **Patrón M5 (precedente M2.2/M4.4)**: las tablas transversales de dominio viven en `drizzle/rls.sql`, no en `schema.ts`, y se leen con SQL crudo (`tx.execute` con `.rows`) porque no hay builder tipado de Drizzle. Los settings RLS de `withTenant` cubren los INSERT/UPDATE.
- **Patrones firmes**: `withTenant(clubId, fn, actor?)` + `ctx.audit(...)`; `audit()` solo acepta `'create' | 'update' | 'delete' | 'custom'`; `requirePermission`/`checkPermission`; Button Base UI con prop `render`; params del app-router son `Promise` (`await params`); `tx.execute` devuelve `QueryResult` con `.rows` (jamás `const [fila] = await tx.execute(...)`).
- **Push M6 (canal post-commit, patrón `sendMail`)**: `ctx.onCommit(fn)` en `withTenant` acumula callbacks que corren SOLO si la tx commitea, best-effort (try/catch + `[withTenant:onCommit]`). `emitirNotificaciones(ctx: Pick<TenantCtx,'tx'|'onCommit'>, clubId, inputs)` escribe en `notifications` y programa `enviarPush` (dedupe idempotente por `{userId,type,title,data}`). `enviarPush(clubId, inputs)` corre post-commit, junta `push_subscriptions` por club + user_ids, `webpush.setVapidDetails` con `VAPID_SUBJECT`/`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, limpia suscripciones 404/410; sin VAPID loguea `[push:dev]`. Keys VAPID + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en `.env.local` (gitignoreado).
- **Suscripción push del socio**: `/api/portal/push/register` y `/api/portal/push/unregister` (POST `?club=<slug>`, usan `rolesEnClub` → `ctx.clubId`/`ctx.userId`); register hace upsert `ON CONFLICT (club_id, endpoint) DO UPDATE SET keys_*, user_agent, last_seen_at`. `PushSubscribeCard` (client) registra el SW si hace falta, pide permiso, suscribe con la key pública y postea; `public/sw.js` maneja `push` (payload JSON `{type,title,body,data,clubId}` → `showNotification`) y `notificationclick` (abre `/portal` o `/portal/pagos` según type). La card vive en `/notificaciones` (staff y socios la ven).
- **Roles staff vs socio**: `STAFF_ROLES` = presidente, secretaria, tesorero, coordinador, entrenador, manager. `rolesEnClub(slug)` (nuevo, en `src/lib/permissions/index.ts`) devuelve el `PermissionContext` sin exigir permiso — lo usan el layout `(app)/[club]` (elige shell staff vs portal), `requirePermission`, `src/app/page.tsx` (redirect a dashboard o portal) y `[club]/page.tsx`. Los que no son staff van a `/portal` y jamás al backoffice (`MemberRedirect`).
- **Shell del portal**: `(app)/[club]/layout.tsx` ramifica: staff → sidebar + AppNav; socio → `PortalShell` (header móvil con nav Inicio/Carnet/Pagos/Notificaciones, `max-w-3xl`). Las páginas del portal (`datosPortal`, `datosCarnet`, `ultimosMovimientosPortal`) NO piden permisos de staff: el acceso ya lo acota el layout + RLS, y arrancan siempre desde `ctx.personId`.
- **Pago portal**: `crearLinkPago` (action) valida que la cuenta pertenezca al grupo familiar del socio (persona + `tutor_de`) y reusa `crearPreferenciaPago` de `src/modules/cobranzas/mercadopago.ts` (mismo `externalRef` `${clubId}:${accountId}:${periodo}` → el webhook acredita solo). Sin `MERCADOPAGO_ACCESS_TOKEN` devuelve link dev.
- **Carnet QR rotativo**: `/api/portal/carnet-token?club=<slug>` firma un JWT HS256 de 5 min (`clubId`, `sub=personId`) con `PORTAL_QR_SECRET` (fallback `AUTH_SECRET`/`CRON_SECRET`); `QrCarnet` (cliente) lo refresca cada 30s y grafica con `qrcode`. El secreto nunca viaja al cliente.
- **Notificaciones para socios**: `notificaciones.ver` fue dado también a `tutor` y `jugador` (`ROLE_PERMISSIONS`); la página/actions ya filtran por `user_id`, así el socio lee su bandeja. El push sigue ese patrón (`emitirNotificaciones` con `userId`; `enviarPush` junta `push_subscriptions` por user).
- **PWA**: `src/app/manifest.ts` (`/manifest.webmanifest`), `public/sw.js` (network-first + fallback 503 + handlers `push`/`notificationclick`), `public/icons/{icon,maskable}.svg`, `src/app/icon.svg`, `src/app/PwaRegister.tsx` (registra SW solo en prod), `src/app/offline/page.tsx`, `next.config.ts` (headers no-cache `/sw.js`), middleware con `RESERVED_FIRST_SEGMENT` (`api`, `login`, `registro`, `recuperar`, `favicon.ico`, `icon.svg`, `sw.js`, `manifest.webmanifest`, `icons`, `offline`).
- **Enums útiles**: `chargeStatus` pendiente/parcial/pagado/vencido/anulado; `membershipStatus` pendiente/activa/suspendida/baja; `relationshipKind` tutor_de/conyuge_de/hermano_de (tutor → hijo por `relationships.personId = tutor`); `eventKind` entrenamiento/partido/cena/asamblea/buffet.
- **Dependencia nueva**: `qrcode` + `@types/qrcode` (browser `QRCode.toDataURL`).
- **Comando utilidad**: `npx tsx --env-file=.env.local probe.ts` (raíz, borrar tras uso). `npx eslint` corre sobre todo el repo. Suite: 115 tests en 7 archivos.

## Work State
### Completed
- **M5 cerrado** (push `6a16c2d`): canal mail real (`sendMail` post-commit, `mailsEnviados`), bandeja `/notificaciones` (actions `marcarLeida`/`marcarTodasLeidas` filtran por `user_id`), historial `contact_log`, planes de pago con progreso (`avancePlan`), tests del runner (dedupe + mails). Todo verificado (tsc/eslint/115 tests/build).
- **M6 · PWA**: manifest + SW + iconos SVG (any + maskable) + `PwaRegister` + headers `/sw.js` + middleware + `/offline`. Verificado con build (ruta `/offline` estática).
- **M6 · Login unificado + shell**: `rolesEnClub`, `STAFF_ROLES`, layout `(app)/[club]` ramificado (staff ↔ portal), `MemberRedirect` (socio que toca ruta de staff → `/portal`), `src/app/page.tsx` (redirect por club según rol → dashboard o portal), `[club]/page.tsx` index nuevo. `notificaciones.ver` para tutor/jugador.
- **M6 · Portal (queries + actions + API)**: `src/modules/portal/queries.ts` (`personasDelMiembroTx`, `datosPortal`, `datosCarnet`, `ultimosMovimientosPortal` — todo dentro de un único `withTenant`, sin anidar), `actions.ts` (`crearLinkPago`, valida cuenta propia del grupo familiar), `/api/portal/carnet-token` (JWT rotativo).
- **M6 · Páginas**: `/portal` (saludo, próximo evento formateado con timezone del club, tarjetas de cuenta con cargos abiertos y `PagoPortalButton`), `/portal/carnet` (tarjeta con foto/iniciales, nº socio, DNI, categorías, membresías, `QrCarnet`), `/portal/pagos` (cargos pendientes + botón MP + últimos movimientos debit/credito). Nav del portal en el shell.
- **Verificación**: `npx tsc --noEmit`, `npx eslint`, `npm test` (115), `npm run build` — todos OK con las rutas del portal, push y PWA.
- **Probe**: validado contra base real que `tutor1@los-cedros.test` (rol `tutor`, 1 hijo `tutor_de`) ve su cuenta "Familia O'Connell" con 2 movimientos. Borrado.
- **M6 · Push notificaciones** (en `6faae95`): `push_subscriptions` en rls.sql sección 12 (aplicada); `TenantCtx.onCommit` + ejecución post-commit en `tenant.ts`; `src/lib/notifications/push.ts` (`enviarPush`) y `emit.ts` (`emitirNotificaciones({ tx, onCommit }, ...)`) — call sites migrados (cobranzas, eventos, morosidad actions + runner); APIs `/api/portal/push/{register,unregister}`; `PushSubscribeCard` en `/notificaciones`; handlers `push`/`notificationclick` en `public/sw.js`; VAPID en `.env.local`. Verificado tsc/eslint/115 tests/build.

### Active
- **M6 · Subida de documentos**: falta — se conecta con M7 (tipos de documento, R2 con URLs firmadas). Probablemente esperar a M7 para hacerlo junto.

### Blocked
- (none)

## Next Move
1. **M7 · Documentos y vencimientos**: tipos de documento, estados pendiente/vigente/vencido/rechazado, R2 con URLs firmadas, alertas 30/15/3 días (incluye subida de documentos del socio pendiente de M6).
2. **M8 · Dashboards por rol**.
3. (none)

## Relevant Files
- `src/lib/permissions/index.ts`: `rolesEnClub`, `STAFF_ROLES`, `requirePermission`/`checkPermission`, `ROLE_PERMISSIONS` con `notificaciones.ver` para tutor/jugador.
- `src/app/(app)/[club]/layout.tsx`: shell staff vs `PortalShell` de socio + `MemberRedirect`.
- `src/app/page.tsx` + `src/app/(app)/[club]/page.tsx`: post-login por rol → dashboard o portal.
- `src/modules/portal/queries.ts`: `datosPortal`, `datosCarnet`, `ultimosMovimientosPortal`, `personasDelMiembroTx`.
- `src/modules/portal/actions.ts`: `crearLinkPago` (Mercado Pago, reusa `crearPreferenciaPago`).
- `src/app/api/portal/carnet-token/route.ts` + `src/modules/portal/components/QrCarnet.tsx`: QR rotativo (JWT HS256 + `qrcode`).
- `src/modules/portal/components/PagoPortalButton.tsx` + páginas `src/app/(app)/[club]/portal/{page,carnet,pagos}/page.tsx`.
- PWA: `src/app/manifest.ts`, `public/sw.js`, `public/icons/*.svg`, `src/app/icon.svg`, `src/app/PwaRegister.tsx`, `src/app/offline/page.tsx`, `next.config.ts`, `src/middleware.ts`.
- `src/modules/cobranzas/mercadopago.ts`: `crearPreferenciaPago` (externalRef `${clubId}:${accountId}:${periodo}`).
- `src/modules/notificaciones/`: bandeja que reusan los socios (`notificaciones.ver`) + `PushSubscribeCard`.
- `src/lib/notifications/push.ts` + `emit.ts`: `enviarPush` (VAPID post-commit) y `emitirNotificaciones({ tx, onCommit }, ...)`.
- `src/db/tenant.ts`: `TenantCtx.onCommit` — callbacks post-commit best-effort.
- `src/app/api/portal/push/{register,unregister}/route.ts`: suscripción push del socio (upsert/delete con `rolesEnClub`).
- `src/modules/morosidad/runner.ts` + `src/app/api/cron/cobranza/route.ts`: runner sin sesión + cron diario (M5).
- `drizzle/rls.sql`: secciones 10–12 aplicadas.
