# Plataforma de gestión de clubes deportivos — Brief maestro

> Este archivo es la fuente de verdad del proyecto. Vive en la raíz del repo como `CLAUDE.md`.
> Claude Code debe leerlo completo antes de escribir código y volver a él ante cualquier duda de alcance.

---

## 1. Qué estamos construyendo

Un SaaS multi-tenant de gestión integral para clubes deportivos. Cada club es un tenant aislado que activa los módulos que necesita.

**Cliente ancla:** Club Los Cedros (Los Polvorines, Buenos Aires). Rugby y hockey. Aproximadamente 700 jugadores, ~20 por categoría. Cuota base cercana a $65.000 mensuales, hockey más cara. Cobran por efectivo, transferencia y débito automático. Hay morosidad y hoy nadie sabe cuánta.

**Objetivo comercial del MVP:** que Los Cedros reemplace Excel + WhatsApp + planillas por esta plataforma en 10 semanas, y que el sistema sea vendible a otros clubes de la zona sin una sola línea de código específica de Los Cedros.

**Lo que hoy resuelve el club a mano y nosotros automatizamos:**
- Nadie sabe cuántos morosos hay ni cuánto deben.
- Alguien concilia el extracto bancario contra el padrón todos los meses.
- Los pagos por transferencia llegan como captura de pantalla por WhatsApp.
- El efectivo del cobrador se anota en un cuaderno.
- Las convocatorias y la asistencia viven en 14 grupos de WhatsApp.
- Los aptos médicos vencidos se descubren el día del partido.

---

## 2. Reglas no negociables

Estas reglas se verifican en cada PR. Violarlas es motivo de rechazo aunque el feature funcione.

1. **Multi-tenant desde el primer commit.** Toda tabla de dominio lleva `club_id`. Toda query pasa por el repositorio que exige `clubId`. RLS activo en Postgres como segunda barrera.
2. **Nada hardcodeado.** Nombres de club, escudos, colores, categorías, divisiones, tipos de cuota, posiciones y roles salen de la base de datos o de `clubs.sport_pack`. Si aparece el string `"Los Cedros"` o `"M15"` en el código, está mal.
3. **Una persona, muchos roles.** Nunca crear tablas `socios`, `jugadores`, `padres` separadas. Todo es `persons` + `person_roles` con vigencia.
4. **La cuenta corriente es del grupo familiar, no de la persona.** Un padre con tres hijos recibe un solo estado de cuenta.
5. **El dinero no se edita.** `ledger_entries` es append-only. Los errores se corrigen con asiento inverso.
6. **Nada se borra.** Soft delete con `deleted_at` en todas las tablas de dominio.
7. **Precios versionados.** Con inflación argentina hay que poder responder "cuánto valía la cuota en marzo".
8. **Todo queda auditado.** Quién, qué, cuándo, desde dónde.
9. **Server Components por defecto.** `'use client'` solo cuando hay estado o interacción real.
10. **Sin `any`.** TypeScript strict. Validación con Zod en el borde.

**Detector de acoplamiento:** el seed crea siempre dos clubes, `los-cedros` (rugby + hockey) y `demo-fc` (fútbol). Cualquier feature debe funcionar en ambos. Si algo se rompe en `demo-fc`, hay código que asume Los Cedros.

---

## 3. Stack cerrado

No proponer alternativas. Estas decisiones ya están tomadas.

| Capa | Elección |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| Base de datos | PostgreSQL 16 en Neon |
| ORM | Drizzle + drizzle-kit |
| Auth | Auth.js (credentials + magic link) |
| UI | Tailwind + shadcn/ui + lucide-react |
| Estado servidor | Server Actions + TanStack Query donde haga falta |
| Validación | Zod + React Hook Form |
| Pagos | Mercado Pago (Checkout Pro, webhooks, suscripciones) |
| Mail | Resend + React Email |
| WhatsApp | WhatsApp Cloud API |
| Archivos | Cloudflare R2, URLs firmadas de vida corta |
| Jobs | Vercel Cron + tabla de jobs en Postgres |
| Deploy | Vercel |
| Errores | Sentry |
| Tests | Vitest + Playwright para los flujos críticos |

**Explícitamente fuera del stack:** microservicios, backend separado, GraphQL, Redis, BullMQ, Docker en desarrollo, app nativa, ORM que no sea Drizzle. Se agregan solo ante un problema medido, nunca preventivamente.

---

## 4. Estructura del proyecto

```
src/
  app/
    (auth)/login, registro, recuperar
    (public)/[club]/                    landing pública e inscripción del club
    (app)/[club]/
      dashboard/                        se resuelve por rol
      personas/                         padrón
      categorias/
      calendario/
      asistencia/
      cuotas/
      cobranzas/
      morosidad/
      documentos/
      configuracion/
    (portal)/[club]/mi/                 portal del socio y del padre
    api/
      webhooks/mercadopago/
      webhooks/whatsapp/
      cron/
  db/
    schema.ts                           el schema provisto, no reescribir
    client.ts                           cliente Drizzle
    tenant.ts                           withTenant(): transacción + set_config
  modules/
    <modulo>/
      actions.ts                        server actions
      queries.ts                        lecturas
      service.ts                        reglas de negocio puras y testeables
      schemas.ts                        Zod
      components/
  lib/
    auth/, permissions/, audit/, notifications/, money/, dates/
  components/ui/                        shadcn
```

**Regla de módulos:** un módulo no importa de otro módulo. Si necesita algo, lo pide por `service.ts` o se sube la lógica compartida a `lib/`.

---

## 5. Convenciones

- Base de datos en `snake_case`, código en `camelCase`. Drizzle hace el mapeo.
- Tablas en plural, en español (`persons` es la excepción histórica del schema, se mantiene).
- Toda tabla: `id` uuid, `created_at`, `updated_at`, `deleted_at` donde aplique.
- Plata: `numeric(14,2)` en la base, `Decimal` o entero de centavos en el código. **Nunca `float`.**
- Fechas sin hora: `date`. Con hora: `timestamptz`. Todo se renderiza en `clubs.timezone`.
- Server Actions devuelven `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzan al cliente.
- Cada Server Action: valida con Zod, verifica permiso, ejecuta dentro de `withTenant`, escribe auditoría.
- Componentes en español para el dominio (`FichaSocio`), en inglés para lo genérico (`DataTable`).

---

## 6. Acceso a datos y aislamiento

```ts
// db/tenant.ts
export async function withTenant<T>(clubId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_club', ${clubId}, true)`)
    return fn(tx)
  })
}
```

Ninguna query toca `db` directamente fuera de `withTenant`. El `true` final hace el setting local a la transacción, para que no se filtre entre requests del pool.

El usuario de conexión de la app **no puede ser owner de las tablas ni superuser**, porque esos roles ignoran RLS.

---

## 7. Modelo de permisos

No hay roles planos. Hay permisos con alcance.

```ts
type Scope = { kind: 'club' } | { kind: 'team'; teamId: string } | { kind: 'person'; personId: string }
type Permission = 'personas.ver' | 'personas.editar' | 'cuotas.ver' | 'cuotas.emitir'
                | 'cobranzas.registrar' | 'morosidad.ver' | 'asistencia.tomar'
                | 'asistencia.ver' | 'documentos.aprobar' | 'config.editar' | ...
```

Los permisos se derivan de `person_roles` vigentes:

| Rol | Alcance | Puede |
|---|---|---|
| presidente | club | todo excepto registrar pagos |
| tesorero | club | cuotas, cobranzas, morosidad, reportes financieros |
| secretaria | club | padrón, documentos, altas y bajas |
| coordinador | teams de un deporte | ver y editar sus categorías, asistencia, convocatorias |
| manager | su team | asistencia, convocatorias, comunicación de su categoría, ver deuda del grupo sin montos |
| entrenador | su team | asistencia, convocatorias, plantel |
| tutor | sus personas relacionadas | estado de cuenta, pagar, calendario de sus hijos, documentos |
| jugador | sí mismo | su calendario, su asistencia, sus documentos |

**Regla de oro del manager:** puede ver *quién* está al día y quién no, para no convocar a un jugador inhabilitado, pero **no ve montos ni deudas**. Es información sensible entre familias del club.

Helper obligatorio en toda action y toda página:

```ts
await requirePermission('cuotas.emitir', { kind: 'club' })
```

---

## 8. Módulos del MVP

Cada módulo especifica objetivo, entidades, pantallas, reglas de negocio y criterios de aceptación. Los criterios de aceptación son la definición de "terminado".

---

### M0 · Fundaciones

**Objetivo:** que exista un esqueleto multi-tenant seguro sobre el que todo lo demás se apoye.

**Alcance**
- Migraciones de Drizzle a partir del `schema.ts` provisto.
- `rls.sql` aplicado: RLS en toda tabla con `club_id`, trigger append-only en `ledger_entries`, vista `account_balances`.
- Auth.js con email + password y magic link. Verificación de email obligatoria.
- Middleware que resuelve el club desde el segmento `[club]` de la URL y valida que el usuario tenga una `person` activa en ese club.
- Layout base con branding dinámico: nombre, escudo y color primario desde `clubs`.
- Seed con `los-cedros` y `demo-fc`, con categorías, planes de cuota y 40 personas de prueba cada uno.
- `lib/audit`: helper `audit(entity, entityId, action, diff)` que escribe en `audit_log`.

**Criterios de aceptación**
- Un usuario de `demo-fc` que fuerza la URL `/los-cedros/personas` recibe 404, no 403 (no revelar existencia).
- Con RLS activo, una query sin `set_config` devuelve cero filas en vez de todas.
- El login de `los-cedros` muestra escudo y colores de Los Cedros; el de `demo-fc` los suyos. Cero strings hardcodeados.

---

### M1 · Padrón

**Objetivo:** una sola fuente de verdad de las personas del club, con sus roles y sus familias.

**Alcance**
- ABM de personas: datos personales, foto, documento, contacto, número de socio.
- Roles con vigencia: alta, baja y cambio de rol sin perder historia.
- Vínculos familiares: tutor de, cónyuge de, hermano de. Alta bidireccional automática.
- Grupo familiar: al crear un vínculo `tutor_de`, se ofrece unificar la cuenta corriente.
- Buscador global: por apellido, documento, número de socio, categoría o teléfono.
- Ficha de persona con pestañas: datos, familia, deportivo, cuenta corriente, documentos, historial.
- Flujo de alta pública: `/[club]/inscripcion`.
- **Importador de Excel** (crítico).

**Reglas de negocio**
- El documento es único por club. Al cargar uno existente, se ofrece la ficha existente en vez de duplicar.
- Un menor de 18 años **requiere** al menos un vínculo `tutor_de` activo para pasar a estado `activo`.
- El número de socio se asigna al aprobar, no al registrarse.
- Las personas creadas desde la web pública entran como `pendiente_aprobacion` y no ven absolutamente nada del club hasta que secretaría aprueba.

**Importador de Excel**
1. Subida de `.xlsx` o `.csv`.
2. Detección de encabezados y mapeo asistido de columnas, con memoria del mapeo por club.
3. Validación fila por fila con reporte de errores descargable.
4. Detección de duplicados por documento y por nombre + fecha de nacimiento.
5. Previsualización: N nuevas, N actualizadas, N con error.
6. Importación transaccional con posibilidad de deshacer el lote completo.
7. El lote queda registrado en `audit_log`.

**Criterios de aceptación**
- Importar el padrón real de Los Cedros (con datos sucios: nombres en mayúscula, DNI con puntos, fechas en tres formatos, filas vacías) sin intervención manual salvo el mapeo.
- Correr el mismo archivo dos veces no duplica a nadie.
- Un menor sin tutor no puede quedar `activo` y el sistema dice por qué.

---

### M2 · Deportivo

**Objetivo:** absorber el sistema de asistencias actual dentro del modelo único de eventos.

**Alcance**
- Categorías por deporte y temporada, definidas por año de nacimiento.
- Asignación automática sugerida de jugadores a categoría según `born_on`, con override manual.
- Plantel: jugadores y staff con vigencia.
- Calendario del club, filtrable por categoría, deporte y tipo de evento.
- Alta de eventos: entrenamiento (con recurrencia semanal), partido, evento social.
- **Convocatoria:** el manager selecciona del plantel, publica, y se notifica a jugadores y tutores.
- **Asistencia:** pantalla optimizada para celular, un toque por jugador, funciona con mala señal.
- Historial de asistencia por jugador y por categoría, con porcentaje del período.

**Reglas de negocio**
- Convocatoria y asistencia son el mismo registro (`participations`) en distinto estado: `convocado` → `presente` / `ausente` / `justificado`.
- La pantalla de asistencia **marca visualmente** a los jugadores con apto médico vencido o documentación faltante. No los bloquea, pero avisa. Ese aviso es responsabilidad legal del club.
- El estado de deuda se muestra al manager como semáforo, nunca como monto.
- La asistencia se puede tomar offline y sincroniza al recuperar conexión (optimistic UI + cola local).

**Criterios de aceptación**
- Un manager toma asistencia de 20 chicos en menos de 30 segundos desde el celular.
- Publicar una convocatoria dispara notificación a los tutores de los menores convocados, no al menor.
- Un jugador de 2011 se sugiere solo en la categoría correcta al crear la temporada nueva.

---

### M3 · Cuotas y cuenta corriente

**Objetivo:** que el club sepa, en cualquier momento, quién debe cuánto.

**Alcance**
- Planes de cuota por deporte y tipo de socio, con vigencia desde/hasta.
- Descuento por hermano configurable y acumulativo (ej: 2º hermano 20%, 3º 40%).
- Adicionales: por segundo deporte, por socio no deportivo, por cuota social.
- Membresías: qué persona paga qué plan, desde cuándo, contra qué cuenta.
- **Generación mensual automática** de cargos, con previsualización antes de confirmar.
- Ajuste masivo de precios con historial (el precio viejo nunca se pisa).
- Cuenta corriente por grupo familiar: cargos, pagos, saldo, exportable a PDF.
- Notas de crédito y ajustes manuales, siempre con motivo obligatorio.

**Reglas de negocio**
- El descuento por hermano se calcula sobre los hermanos **activos de la misma cuenta**, ordenados por cuota de mayor a menor: el descuento aplica sobre las más baratas.
- Alta o baja a mitad de mes: prorrateo por días, configurable por club (prorratear / cobrar completo / no cobrar).
- La generación mensual es **idempotente**: correrla dos veces para el mismo período no duplica cargos (garantizado por el índice único `charges_membership_period_uq`).
- Un cargo emitido no se edita: se anula con nota de crédito y se emite uno nuevo.
- Todo cargo escribe un `ledger_entry` de débito; todo pago acreditado, uno de crédito.

**Criterios de aceptación**
- Generar las cuotas de julio de 700 personas en menos de 30 segundos y ver la previsualización con totales antes de confirmar.
- Una familia con tres hijos, dos en rugby y uno en hockey, recibe un solo estado de cuenta con el descuento correcto.
- El saldo de `account_balances` coincide siempre con la suma de cargos menos pagos. Test automatizado obligatorio.

---

### M4 · Cobranzas y conciliación

**Objetivo:** eliminar el trabajo manual de cruzar el extracto bancario contra el padrón. Este es el módulo que justifica económicamente todo el proyecto.

**Alcance por método de pago**

**Mercado Pago**
- Link de pago por cuenta con `external_reference` = `accountId:period`.
- Webhook que acredita automáticamente y concilia contra los cargos abiertos.
- Manejo de reintentos, idempotencia por `external_ref` y estados intermedios.

**Transferencia**
- Fase 1: pantalla de conciliación. Se sube el extracto (CSV del banco) y el sistema propone matcheos por monto exacto + ventana de fecha + similitud de nombre del ordenante. El operador confirma con un clic.
- Fase 2 (posterior al MVP, dejar la puerta abierta): CVU o alias virtual por cuenta, conciliación 100% automática. Los campos `virtual_cvu` y `virtual_alias` ya existen en `accounts`.

**Efectivo**
- Pantalla de cobrador optimizada para celular: buscar familia, ver deuda, registrar pago, emitir recibo digital al instante por WhatsApp.
- Cierre de caja diario por cobrador con arqueo.

**Débito automático**
- Generación del archivo de lote en el formato del banco.
- Importación del archivo de rechazos, con reversión automática del pago y reapertura del cargo.

**Reglas de negocio**
- La imputación de un pago a cargos es **FIFO por vencimiento**, salvo imputación manual explícita.
- Un pago puede quedar `pendiente` sin cuenta asignada (transferencia no identificada) y aparecer en la bandeja de no conciliados.
- Un pago rechazado o reversado genera asiento inverso, nunca borra el original.
- Todo pago registrado a mano queda con `recorded_by`.

**Criterios de aceptación**
- Subir un extracto de 200 movimientos y conciliar más del 70% automáticamente.
- Un pago por Mercado Pago se ve reflejado en el portal del socio en menos de 10 segundos.
- Un webhook duplicado de Mercado Pago no genera un segundo pago.

---

### M5 · Morosidad y comunicaciones

**Objetivo:** que el club recupere plata sin que nadie tenga que perseguir a nadie a mano.

**Alcance**
- Panel de morosidad: deuda total, cantidad de cuentas deudoras, antigüedad de la deuda por tramos (1, 2, 3, más de 3 meses), evolución mensual.
- Segmentación: por categoría, por deporte, por antigüedad, por monto.
- **Motor de reglas de cobranza:** disparadores configurables por club.
  - Ejemplo: a los 5 días del vencimiento, recordatorio amable por WhatsApp con link de pago.
  - A los 20, recordatorio firme por WhatsApp y mail.
  - A los 45, aviso al coordinador de la categoría.
  - A los 60, sugerencia de suspensión de carnet (requiere confirmación humana, nunca automática).
- Plantillas de mensaje con variables (`{{nombre}}`, `{{monto}}`, `{{link_pago}}`), editables por el club.
- Planes de pago: dividir una deuda en N cuotas con seguimiento.
- Registro de todo contacto enviado, para no duplicar y para poder demostrarlo.

**Reglas de negocio**
- Ningún mensaje de cobranza sale entre las 21:00 y las 9:00.
- Máximo un mensaje de cobranza por cuenta por semana, sin importar cuántas reglas disparen.
- La suspensión de un socio **nunca** es automática. Siempre requiere confirmación de un humano con permiso.
- Los mensajes van al tutor pagador, jamás al menor.

**Criterios de aceptación**
- El tesorero abre el panel y en 5 segundos sabe cuánto le deben y quiénes son los 20 que más deben.
- Configurar una regla nueva no requiere tocar código.
- Un socio que paga deja de recibir recordatorios en el ciclo siguiente sin intervención manual.

---

### M6 · Portal del socio y del padre

**Objetivo:** que la familia se autogestione y deje de escribirle a secretaría por WhatsApp.

**Alcance**
- PWA instalable. Sin app nativa.
- Login unificado: el mismo usuario ve a todos sus hijos.
- Home: próximo evento de cada hijo, estado de cuenta, alertas de documentación.
- Estado de cuenta con detalle y botón de pago que abre Mercado Pago.
- Historial de pagos con recibos descargables.
- Carnet digital con QR y foto, con estado (al día / con deuda) y color visible.
- Calendario de cada hijo con las convocatorias.
- Subida de documentos: apto médico, DNI, consentimientos.
- Actualización de datos de contacto (queda pendiente de aprobación de secretaría).
- Notificaciones push.

**Reglas de negocio**
- Un tutor solo ve a las personas con las que tiene vínculo `tutor_de` vigente.
- Un jugador mayor de 18 ve su propia información completa.
- Un jugador menor de 18 ve calendario y convocatorias, **no** información financiera.
- El QR del carnet rota cada 60 segundos para que no se pueda capturar y compartir.

**Criterios de aceptación**
- Un padre con tres hijos entra una vez y ve todo en una pantalla.
- Pagar la cuota desde el celular toma menos de 4 toques.
- El carnet funciona sin conexión (cache de la PWA).

---

### M7 · Documentos y vencimientos

**Objetivo:** que nunca más se descubra un apto médico vencido el día del partido.

**Alcance**
- Subida de documentos por tipo, con fecha de emisión y vencimiento.
- Estados: pendiente, vigente, vencido, rechazado. Revisión por secretaría o médico.
- Alertas automáticas a 30, 15 y 3 días del vencimiento, al tutor y al coordinador.
- Panel de cumplimiento por categoría: quién tiene todo y quién no.
- Almacenamiento en R2 con URLs firmadas de 5 minutos. **Nunca** URLs públicas.

**Reglas de negocio**
- El apto médico vence por defecto al año de emitido, configurable por club.
- El consentimiento de uso de imagen de un menor lo firma el tutor y queda con timestamp e IP.
- Un documento rechazado exige motivo y notifica al que lo subió.

**Criterios de aceptación**
- El coordinador ve su categoría con un semáforo por jugador.
- Los documentos de menores no son accesibles por URL directa ni aunque se filtre el link.

---

### M8 · Dashboards por rol

**Objetivo:** que cada uno entre y vea lo suyo, sin menús que no le sirven.

- **Presidente:** socios activos y su evolución, ingresos del mes vs mes anterior, morosidad total y su tendencia, asistencia promedio por deporte.
- **Tesorero:** cobrado del mes vs proyectado, deuda por antigüedad, pagos pendientes de conciliar, próximos vencimientos.
- **Secretaría:** altas pendientes de aprobación, documentos por revisar, datos incompletos.
- **Coordinador:** sus categorías, asistencia de la semana, documentación en rojo, jugadores en riesgo de deserción (3 ausencias seguidas).
- **Manager:** próximo evento, convocatoria abierta, asistencia de su categoría.
- **Tutor:** ver M6.

**Criterio de aceptación:** ningún dashboard tarda más de 800 ms en cargar con 700 personas y 12 meses de historia. Usar vistas materializadas si hace falta.

---

### Transversales

**Notificaciones.** Capa de eventos de dominio (`cuota.vencida`, `convocatoria.publicada`, `documento.por_vencer`, `pago.acreditado`) a la que se suscriben los canales. Nunca llamar a la API de WhatsApp desde la lógica de negocio. Cada usuario configura qué quiere recibir y por dónde.

**Jobs.** Tabla `jobs` en Postgres con `SELECT ... FOR UPDATE SKIP LOCKED`. Vercel Cron dispara el runner. Jobs del MVP: generación mensual de cuotas, evaluación de reglas de cobranza, alertas de vencimiento de documentos, envío de notificaciones, recálculo de dashboards.

**Auditoría.** Toda escritura pasa por `audit()`. La ficha de cada persona muestra su historial de cambios.

**Errores.** Sentry con `clubId` y `userId` como tags. Nunca datos personales en el mensaje de error.

---

## 9. Fuera de alcance del MVP

No construir, ni siquiera "dejando preparado", salvo los campos que ya están en el schema:

Buffet y POS · tienda · inventario · RRHH y sueldos · sponsors · reservas y alquiler de instalaciones · estadísticas de partido y fixture · scouting y evaluaciones · gobernanza y asambleas · facturación electrónica ARCA · IA · app nativa · marketplace · white label.

Si aparece un pedido de estos durante el desarrollo, se anota en `BACKLOG.md` y se sigue.

---

## 10. Diseño

Referencias: Linear, Stripe Dashboard, Vercel. Denso pero respirado, rápido, sin adornos.

- Tipografía sans, jerarquía por peso y tamaño, no por color.
- Neutros + un solo color de acento que sale de `clubs.branding.primary`.
- Color con significado: rojo es deuda o vencido, verde es al día. Nunca decorativo.
- Tablas densas con acciones al hover, no tarjetas gigantes.
- Estados vacíos que invitan a la primera acción, no que se disculpan.
- Skeletons, nunca spinners de pantalla completa.
- **Mobile first en todo lo que usa un manager o un padre.** Asistencia, convocatoria, cobrador y portal se diseñan primero para 380px de ancho.
- Toda acción destructiva pide confirmación escribiendo algo, no un "¿estás seguro?".

---

## 11. Seguridad y datos de menores

El club maneja datos de salud y datos de menores. Esto no es opcional.

- Datos sensibles (salud, documentos) cifrados en reposo y con acceso restringido por permiso explícito.
- Archivos con URLs firmadas de vida corta. Nunca buckets públicos.
- Rate limiting en login, registro y recuperación de contraseña.
- Consentimiento del tutor registrado con timestamp para uso de imagen de menores.
- Exportación y borrado de datos personales a pedido (Ley 25.326).
- Comunicaciones con menores: el sistema **nunca** envía mensajes financieros ni de cobranza a un menor.
- Backups diarios de Neon con retención de 30 días y una restauración de prueba documentada antes de salir a producción.

---

## 12. Plan de ejecución

Trabajar de a una fase. No empezar la siguiente sin que la anterior esté desplegada y probada con datos reales.

| Semana | Fase | Entregable |
|---|---|---|
| 1-2 | M0 | Esqueleto multi-tenant, auth, RLS, seed de dos clubes |
| 3 | Permisos | Motor de permisos con alcance y matriz de roles |
| 4-5 | M1 | Padrón completo + importador, con el padrón real de Los Cedros migrado |
| 6 | M2 | Categorías, convocatorias y asistencia en uso por los managers |
| 7-8 | M3 | Planes, membresías, generación mensual, cuenta corriente familiar |
| 9 | M4 + M5 | Mercado Pago, conciliación, panel de morosidad, recordatorios |
| 10 | M6 + M7 + M8 | Portal del socio, documentos, dashboards |

**Punto de control semanal:** ¿alguien del club usó el sistema esta semana? Si la respuesta es no dos semanas seguidas, el problema no es técnico y hay que frenar a resolverlo.

---

## 13. Cómo trabajar

1. Antes de codear un módulo, releer su sección y confirmar el alcance en una lista corta.
2. Escribir primero `service.ts` con las reglas de negocio puras y sus tests. Después la UI.
3. Un PR por módulo o submódulo. Nunca un PR de 3.000 líneas.
4. Al terminar cada módulo, correr el checklist de reglas no negociables de la sección 2.
5. Ante ambigüedad de negocio, preguntar en vez de asumir. Las decisiones de producto no se inventan.
6. Ante ambigüedad técnica dentro del stack cerrado, decidir y documentar en `DECISIONS.md`.
