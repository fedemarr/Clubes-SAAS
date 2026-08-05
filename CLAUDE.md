## Objective
- **M5 · Morosidad y comunicaciones (brief)** completo y desplegado: panel de morosidad por antigüedad, motor de reglas de cobranza configurables con plantillas y dedupe, runner manual, planes de pago. M4 quedó cerrado y pusheado.

## Important Details
- **Deploy**: repo `https://github.com/fedemarr/Clubes-SAAS.git`, Vercel `fmcodes-projects/club-saas`, auto-deploy desde `main`. `origin/main` en `d55fc8a` (M5). Previos `6292e2b`, `31291fa`, `7b938ca` también pusheados.
- **Base Neon única**: producción y dev comparten la misma base. `npm run db:rls` ya aplicó la sección 11 de M5 (`message_templates`, `cobranza_rules`, `contact_log`, `payment_plans`) en la base compartida. No hace falta `.env.production.local` ni `db:rls:prod`.
- **Credenciales seed**: password `Cambiar123!`; emails `<rol>@<slug>.test`; slugs `los-cedros`, `demo-fc`.
- **Regla de dinero**: cents vía `src/lib/money.ts` (`decimalToCents`/`centsToDecimal`/`formatARS`); base `numeric(14,2)`.
- **Patrón M5 (precedente M2.2/M4.4)**: las tablas transversales de dominio viven en `drizzle/rls.sql`, no en `schema.ts`, y se leen con SQL crudo (`tx.execute` con `.rows`) porque no hay builder tipado de Drizzle. Los settings RLS de `withTenant` cubren los INSERT/UPDATE.
- **Reglas de negocio M5 (service puro, 20 tests)**: silencio nocturno 21–9 (timezone `America/Argentina/Buenos_Aires`); máximo 1 mensaje por cuenta por semana — reglas de mensaje se bloquean entre sí, `coordinador`/`suspension` deduplican por su propia regla; mensajes al tutor pagador, jamás al menor; **la suspensión nunca es automática** (solo sugiere, `resolved_at` la cierra).
- **Patrones firmes**: `withTenant(clubId, fn, actor?)` + `ctx.audit(entity, entityId, action, diff?)`; `audit()` solo acepta `'create' | 'update' | 'delete' | 'custom'` (acciones custom van como `audit(..., 'custom', { action: '...' })`); `requirePermission`/`checkPermission`; Button Base UI con prop `render`; params del app-router son `Promise` (`await params`); `tx.execute` devuelve `QueryResult` con `.rows`.
- **Trampa Base UI select**: `onValueChange` pasa `string | null` → coerce `v ?? ''` antes de guardar en estado string (MorosidadPanel).
- **Enums útiles**: `chargeStatus` pendiente/parcial/pagado/vencido/anulado; `membershipStatus` pendiente/activa/suspendida/baja; `relationshipKind` tutor_de/conyuge_de/hermano_de; `entryDirection` debito/credito.

## Work State
### Completed
- **M4.4 débito automático** (ya pusheado en `6292e2b`): tabla `debito_lotes`, CBU en `persons.custom.debitoCbu`, `generarLoteDebito` (CSV genérico), `acreditarLoteDebito` (ledger FIFO + notif), `importarRechazosDebito` con asiento inverso, `DebitoPanel`, página `/cuotas/debito`.
- **M5 · Service puro**: `src/modules/morosidad/service.ts` — `tramoAntiguedad` (1..4), `mesesEntre`, `diasDesde`, `HORARIO_SILENCIO`, `enHorarioSilencio`, `renderizarPlantilla`, `evaluarReglasCobranza` (disparos + omitidos con motivo), `sumarMeses`, `planDePago` (división exacta repartiendo resto de a 1 centavo), `avancePlan`. `service.test.ts`: 20 tests pasando (113 total en la suite).
- **M5 · Queries**: `src/modules/morosidad/queries.ts` — `deudoresMorosidad` (deuda de `account_balances`, cargo abierto más viejo, deportes vía memberships→feePlans, tutor pagador si titular menor, filtros deporte/tramo/monto/top), `resumenMorosidad` (deuda total, tramos, por deporte, evolución mensual 13 meses, top20), `listarReglasCobranza`/`listarPlantillas`/`plantillasPorKey`/`listarContactosRecientes`/`listarSugerenciasPendientes`/`listarPlanesDePago`/`coordinadoresPorDeporte` (todas con SQL crudo sobre rls.sql).
- **M5 · Schemas**: `src/modules/morosidad/schemas.ts` — Zod para reglas (canal whatsapp|mail|coordinador|suspension, dedupeDias>=1), plantillas (key lowercase/underscore), resolver sugerencia, plan de pago (1–24 cuotas).
- **M5 · Actions**: `src/modules/morosidad/actions.ts` — `guardarReglaCobranza`, `eliminarReglaCobranza` (desactiva, nada se borra), `guardarPlantilla` (upsert por key), `ejecutarCobranza` (runner manual: deudores+reglas+plantillas+dedupe, inserta en `contact_log`, emite `cobranza.recordatorio`/`cobranza.aviso_coordinador`, sugerencias quedan abiertas), `resolverSugerencia`, `crearPlanDePago` (valida deuda actual, notifica al titular).
- **M5 · UI**: `src/app/(app)/[club]/cuotas/morosidad/page.tsx` (StatCards deuda total + 4 tramos, deuda por deporte, evolución mensual con barras, top20 en tabla, alerta de sugerencias) + `MorosidadPanel` client (ejecutar cobranza, CRUD de reglas/plantillas, resolver sugerencias, crear planes). Enlace "Morosidad" en `/cuotas/cobranzas` y nav del sidebar (icono `AlertTriangle`, solo con `morosidad.ver`).
- **Permisos**: `morosidad.ver` (presidente + tesorero), `morosidad.configurar` (tesorero). Tablas M5 en `rls.sql` sección 11 ya aplicadas.
- **Verificación**: tsc/eslint/vitest (113 tests)/build (`/cuotas/morosidad` 171 kB) OK. Commit `d55fc8a` pusheado.

### Active
- (none)

### Blocked
- (none)

## Next Move
1. **M5 pendiente fino**: seed de reglas/plantillas por defecto para `los-cedros` y `demo-fc` (ej. regla "recordatorio amable" a 5 días con plantilla), para que el motor tenga algo que correr desde el día 1; cron job de `ejecutarCobranza` (tabla `jobs` + Vercel Cron).
2. **M6 · Portal del socio y del padre** (brief): PWA instalable, login unificado, home con próximo evento + estado de cuenta, botón de pago MP, carnet digital con QR rotativo, subida de documentos, notificaciones push.
3. **M7 · Documentos y vencimientos**: tipos de documento, estados pendiente/vigente/vencido/rechazado, R2 con URLs firmadas, alertas 30/15/3 días.
4. **M8 · Dashboards por rol**.
5. (none)

## Relevant Files
- `src/modules/morosidad/service.ts` + `service.test.ts`: motor puro M5 completo (tramos, silencio, reglas, plantillas, planes) — 20 tests OK.
- `src/modules/morosidad/queries.ts`: panel + configuración + contactos + planes, todo sobre `account_balances`, `cobranza_rules`, `message_templates`, `contact_log`, `payment_plans`.
- `src/modules/morosidad/actions.ts`: runner `ejecutarCobranza` con dedupe y notificaciones; `schemas.ts` Zod al borde.
- `src/modules/morosidad/components/MorosidadPanel.tsx` + `src/app/(app)/[club]/cuotas/morosidad/page.tsx`: panel + página.
- `drizzle/rls.sql`: sección 11 con las 4 tablas M5 (ya aplicada en la base compartida).
- `src/lib/permissions/index.ts`: `morosidad.ver` (presidente/tesorero), `morosidad.configurar` (tesorero).
- `src/lib/notifications/emit.ts`: `emitirNotificaciones(tx, clubId, [{userId, type, title, body, data}])` — canal transversal de los disparos.
- `src/lib/audit/index.ts`: `AuditAction` = `'create' | 'update' | 'delete' | 'custom'` — acciones M5 custom viajan en `diff.action`.
