## Objective
- **M5 · Morosidad y comunicaciones (brief)** completo y desplegado: panel de morosidad por antigüedad, motor de reglas de cobranza configurables con plantillas y dedupe, runner manual + cron diario, planes de pago, seed de reglas/plantillas por defecto. M4 quedó cerrado y pusheado.

## Important Details
- **Deploy**: repo `https://github.com/fedemarr/Clubes-SAAS.git`, Vercel `fmcodes-projects/club-saas`, auto-deploy desde `main`. `origin/main` en `bb72c04` (M5 fino). Previos `d55fc8a` (M5), `6292e2b`, `31291fa`, `7b938ca` también pusheados.
- **Base Neon única**: producción y dev comparten la misma base. `npm run db:rls` aplicó la sección 11 de M5 (`message_templates`, `cobranza_rules`, `contact_log`, `payment_plans`) y `npm run db:seed:m5` sembró reglas/plantillas por defecto en los-cedros y demo-fc. No hace falta `.env.production.local` ni `db:rls:prod`.
- **Credenciales seed**: password `Cambiar123!`; emails `<rol>@<slug>.test`; slugs `los-cedros`, `demo-fc`.
- **Regla de dinero**: cents vía `src/lib/money.ts` (`decimalToCents`/`centsToDecimal`/`formatARS`); base `numeric(14,2)`.
- **Patrón M5 (precedente M2.2/M4.4)**: las tablas transversales de dominio viven en `drizzle/rls.sql`, no en `schema.ts`, y se leen con SQL crudo (`tx.execute` con `.rows`) porque no hay builder tipado de Drizzle. Los settings RLS de `withTenant` cubren los INSERT/UPDATE.
- **Reglas de negocio M5 (service puro, 20 tests)**: silencio nocturno 21–9 (timezone `America/Argentina/Buenos_Aires`); máximo 1 mensaje por cuenta por semana — reglas de mensaje se bloquean entre sí, `coordinador`/`suspension` deduplican por su propia regla; mensajes al tutor pagador, jamás al menor; **la suspensión nunca es automática** (solo sugiere, `resolved_at` la cierra).
- **Runner sin sesión**: `src/modules/morosidad/runner.ts` tiene `ejecutarCobranzaCore(clubId)` — lo llaman la Server Action (con `morosidad.ver`) y el cron de Vercel (`/api/cron/cobranza`, diario 12:00 UTC = 09:00 ARG). Seguridad del cron: si `CRON_SECRET` está seteado exige `Authorization: Bearer <secret>`; si no, exige header `x-vercel-cron`.
- **Patrones firmes**: `withTenant(clubId, fn, actor?)` + `ctx.audit(entity, entityId, action, diff?)`; `audit()` solo acepta `'create' | 'update' | 'delete' | 'custom'` (acciones custom van como `audit(..., 'custom', { action: '...' })`); `requirePermission`/`checkPermission`; Button Base UI con prop `render`; params del app-router son `Promise` (`await params`); `tx.execute` devuelve `QueryResult` con `.rows`.
- **Trampa Base UI select**: `onValueChange` pasa `string | null` → coerce `v ?? ''` antes de guardar en estado string (MorosidadPanel).
- **Enums útiles**: `chargeStatus` pendiente/parcial/pagado/vencido/anulado; `membershipStatus` pendiente/activa/suspendida/baja; `relationshipKind` tutor_de/conyuge_de/hermano_de; `entryDirection` debito/credito.

## Work State
### Completed
- **M4.4 débito automático** (pusheado `6292e2b`): `debito_lotes`, CBU en `persons.custom.debitoCbu`, lote CSV genérico, acreditación ledger FIFO, rechazos con asiento inverso, `DebitoPanel`, `/cuotas/debito`.
- **M5 · Service puro**: `src/modules/morosidad/service.ts` — tramos, silencio, plantillas, `evaluarReglasCobranza`, `planDePago` (división exacta con resto de a 1 centavo), `avancePlan`. 20 tests OK (113 suite).
- **M5 · Queries**: `src/modules/morosidad/queries.ts` — `deudoresMorosidad`, `resumenMorosidad`, `listarReglasCobranza`, `listarPlantillas`, `plantillasPorKey`, `listarContactosRecientes` (dedupe), `listarSugerenciasPendientes`, `listarPlanesDePago`, `coordinadoresPorDeporte` — SQL crudo sobre rls.sql.
- **M5 · Schemas + Actions**: `schemas.ts` (Zod) + `actions.ts` — `guardarReglaCobranza`, `eliminarReglaCobranza` (desactiva), `guardarPlantilla` (upsert por key), `ejecutarCobranza` (envuelve el core con permiso), `resolverSugerencia`, `crearPlanDePago`.
- **M5 · Runner + Cron**: `runner.ts` (`ejecutarCobranzaCore`, sin auth, notif `cobranza.recordatorio`/`aviso_coordinador`, registra en `contact_log`, agrega var `{{club}}`) + `src/app/api/cron/cobranza/route.ts` (itera todos los clubs) + `vercel.json` con cron `0 12 * * *`.
- **M5 · Seed**: `src/db/seed-morosidad.ts` (`npm run db:seed:m5`, idempotente) — 2 plantillas (`recordatorio_amable`, `aviso_mail`) + 4 reglas (`Recordatorio amable` 5d whatsapp, `Aviso por mail` 15d, `Derivación a coordinador` 30d, `Sugerencia de suspensión` 60d) en los-cedros y demo-fc. Aplicado.
- **M5 · UI**: `/cuotas/morosidad` (StatCards deuda total + 4 tramos, por deporte, evolución mensual, top20, alerta de sugerencias) + `MorosidadPanel` (ejecutar cobranza, CRUD reglas/plantillas, resolver sugerencias, crear planes). Enlaces en cobranzas y sidebar (icono `AlertTriangle`, `morosidad.ver`).
- **Permisos**: `morosidad.ver` (presidente + tesorero), `morosidad.configurar` (tesorero).
- **Verificación**: tsc/eslint/vitest (113)/build OK (ruta cron `141 B`). Commits `d55fc8a` y `bb72c04` pusheados.

### Active
- (none)

### Blocked
- (none)

## Next Move
1. **M6 · Portal del socio y del padre** (brief): PWA instalable, login unificado, home con próximo evento + estado de cuenta, botón de pago MP, carnet digital con QR rotativo, subida de documentos, notificaciones push.
2. **M7 · Documentos y vencimientos**: tipos de documento, estados pendiente/vigente/vencido/rechazado, R2 con URLs firmadas, alertas 30/15/3 días.
3. **M8 · Dashboards por rol**.
4. (none)
5. (none)

## Relevant Files
- `src/modules/morosidad/service.ts` + `service.test.ts`: motor puro M5 (tramos, silencio, reglas, plantillas, planes) — 20 tests OK.
- `src/modules/morosidad/runner.ts`: `ejecutarCobranzaCore(clubId)` sin sesión — usado por la action y el cron.
- `src/modules/morosidad/actions.ts`: actions con permiso (envuelven el core) + `schemas.ts` Zod.
- `src/modules/morosidad/queries.ts`: panel + configuración + contactos + planes, SQL crudo sobre rls.sql.
- `src/app/api/cron/cobranza/route.ts` + `vercel.json`: cron diario 12:00 UTC; seguridad por `CRON_SECRET` o header `x-vercel-cron`.
- `src/db/seed-morosidad.ts` + script `db:seed:m5`: plantillas y reglas por defecto (idempotente).
- `src/modules/morosidad/components/MorosidadPanel.tsx` + `src/app/(app)/[club]/cuotas/morosidad/page.tsx`: panel + página.
- `drizzle/rls.sql`: sección 11 con las 4 tablas M5 (aplicada).
- `src/lib/permissions/index.ts`: `morosidad.ver`, `morosidad.configurar`.
- `src/lib/notifications/emit.ts`: `emitirNotificaciones(tx, clubId, [{userId, type, title, body, data}])`.
- `src/lib/audit/index.ts`: `AuditAction` = `'create' | 'update' | 'delete' | 'custom'` — acciones custom en `diff.action`.
