# Roadmap — de MVP a plataforma completa

> Complemento de `CLAUDE.md`. La sección 9 del brief lista lo que queda fuera del MVP; **este archivo dice cuándo entra cada cosa**.
> Claude Code debe leerlo antes de tomar decisiones de diseño, para no cerrar puertas que se abren más adelante.
> Nada de esto se construye antes de tiempo. Pero nada de esto se diseña en contra.

Estimaciones para un desarrollador solo trabajando con Claude Code, sobre el núcleo ya terminado.

---

## Fase 0 · MVP — semanas 1 a 10

Ver `CLAUDE.md` sección 12. Al final de esta fase, Los Cedros cobra, convoca y toma asistencia con la plataforma.

**Condición para pasar a Fase 1:** dos ciclos completos de cobranza mensual ejecutados sin intervención manual y sin errores de saldo.

---

## Fase 1 · Consolidación y primer club nuevo — semanas 11 a 20

El objetivo de esta fase no es agregar features, es **vender el segundo club**. Todo lo que se construye acá sirve para eso.

| Módulo | Semanas | Por qué acá |
|---|---|---|
| **Onboarding autoservicio de club** | 2 | Alta de tenant, wizard de configuración, importación de padrón guiada. Sin esto, cada club nuevo te cuesta una semana de trabajo manual. |
| **Estadísticas de partido y fixture** | 3 | Es lo que el club *quiere* ver aunque no sea lo que más le duele. Vende. Planilla de partido, resultados, tabla, estadísticas por jugador según `sport_pack`. |
| **Scouting y evaluaciones** | 2 | Port del sistema actual al modelo nuevo. Prospecto → evaluación → aceptado → jugador → socio, sobre `persons` + `person_roles`. |
| **Reservas y alquiler de instalaciones** | 2 | Primer módulo que **genera** ingresos en vez de ahorrar trabajo. Calendario de canchas, alquiler a terceros, cobro online. Argumento de venta directo. |
| **Panel de administración de la plataforma** | 1 | Tu backoffice: clubes, planes, uso, facturación del SaaS. |

**Gancho en el núcleo:** `events` ya soporta reservas (`kind` nuevo + `meta`). Las estadísticas de partido cuelgan de `events` + `participations` con `meta` por deporte. No hace falta tabla nueva de jugadores.

---

## Fase 2 · El club completo — semanas 21 a 34

Acá la plataforma deja de ser "el sistema de socios" y pasa a ser el ERP del club.

| Módulo | Semanas | Notas |
|---|---|---|
| **Buffet y POS** | 3 | Venta rápida táctil, stock, caja, arqueo, cuenta corriente del socio (consumo que se suma a la cuota). Funciona offline. |
| **Inventario** | 2 | Ropa, pelotas, botiquín, utilería. Movimientos, préstamos a jugadores, reposición. Se integra con buffet y con tienda. |
| **Eventos y venta de entradas** | 2 | Cenas, torneos, terceros tiempos. Entradas con QR, acreditación en puerta, cupos. Reusa el motor de `events`. |
| **Gobernanza institucional** | 2 | Comisión directiva, mandatos, actas, asambleas, **padrón de habilitados a votar** según antigüedad y estado de deuda, elecciones. Nadie en el mercado lo tiene. |
| **Sponsors** | 1 | Contratos, vencimientos, espacios publicitarios, cobros. Cuelga de `accounts` y `ledger_entries`. |
| **Comunicación avanzada** | 2 | Campañas segmentadas, newsletter, encuestas, comunicados con acuse de lectura. |
| **Salud y lesiones** | 2 | Parte médico, lesión, tratamiento, **protocolo de conmoción cerebral y return-to-play**. Datos sensibles: acceso restringido al cuerpo médico. Crítico en rugby. |

**Gancho en el núcleo:** el consumo de buffet es un `charge` más contra la misma `account` familiar. Las entradas son `charges` contra cuentas de no socios. El padrón electoral es una query sobre `memberships` + `account_balances`.

---

## Fase 3 · Enterprise y expansión — semanas 35 a 50

| Módulo | Semanas | Notas |
|---|---|---|
| **Facturación electrónica ARCA** | 4 | Alto riesgo y alta complejidad legal. Se hace cuando haya volumen que lo justifique, y evaluando integrar contra Xubio/Colppy antes que construirlo. |
| **RRHH y sueldos** | 4 | Empleados, contratos, licencias, vacaciones. Sueldos probablemente se integre, no se construya. |
| **Tienda / ecommerce** | 3 | Merchandising, retiro en club, envíos. Reusa inventario y pagos. |
| **Control de acceso físico** | 3 + hardware | Molinetes y lectores QR/NFC en la puerta. Es un foso competitivo real: una vez instalado el hardware, el club no se va más. Upsell de alto margen. |
| **API pública y webhooks** | 2 | Habilita integraciones de terceros y el marketplace. |
| **Portal de federación / unión** | 3 | Vista consolidada multi-club para URBA u otra unión: fichajes, pases, habilitaciones, sanciones. **Es el atajo comercial**: una venta institucional entra a decenas de clubes. |

---

## Fase 4 · Inteligencia y escala — continuo

Se construye sobre datos reales acumulados, nunca antes.

- **Cobranza predictiva:** qué familias van a entrar en mora el mes que viene, según su patrón histórico. El módulo con mejor retorno directo.
- **Riesgo de deserción:** jugadores con caída de asistencia y probabilidad de baja. Alerta al coordinador antes de que se vayan.
- **Predicción de lesiones:** carga de entrenamientos + historial + asistencia.
- **OCR de documentos:** leer el apto médico subido y extraer fecha de vencimiento sola.
- **Búsqueda en lenguaje natural:** "jugadores de M16 con apto vencido y cuota al día".
- **Asistente para el tesorero:** resúmenes financieros y explicación de desvíos.
- **Generación de convocatorias sugeridas** según asistencia, estado físico y elegibilidad.

**Precondición:** al menos 12 meses de datos reales de un club y 5 clubes activos. Antes de eso, la IA es una demo, no un producto.

---

## Fase 5 · Producto de plataforma

- **Multi-deporte real:** sport packs de fútbol, hockey, básquet, vóley, handball, tenis, natación. Cada uno es configuración, no código. 2 a 3 días por deporte una vez que hay un club real que lo pida.
- **White label:** dominio propio y branding total para federaciones.
- **Marketplace:** integraciones de terceros sobre la API pública.
- **App nativa:** solo si el push de iOS o el NFC del carnet lo exigen. La PWA cubre casi todo.
- **Expansión regional:** Uruguay, Chile, Paraguay. Requiere abstraer pasarela de pagos y régimen fiscal, ya previsto en `clubs.currency`.

---

## Reglas para no cerrarse puertas

Mientras se construye el MVP, respetar esto evita refactors caros después:

1. **`events` es el motor de todo lo que tiene fecha.** Reservas, entradas, asambleas y turnos son `event_kind` nuevos, no tablas nuevas.
2. **`charges` es el motor de todo lo que se cobra.** Consumo de buffet, entrada a una cena, alquiler de cancha y merchandising son cargos contra una `account`.
3. **`persons` es el motor de todo lo que es gente.** Empleado, proveedor, sponsor y no socio son roles, no tablas.
4. **`documents` sirve para cualquier archivo con vencimiento.** Contratos de sponsor, seguros y habilitaciones incluidos.
5. **Ningún módulo importa de otro.** Todo se comunica por servicios y eventos de dominio.
6. **Toda feature nueva nace configurable por club.** Si un club la quiere y otro no, es un flag, no un `if` con el nombre del club.

---

## Cómo priorizar cuando aparezca un pedido nuevo

Todo pedido que no esté en este roadmap va a `BACKLOG.md` con tres datos: quién lo pidió, qué problema resuelve y cuánta plata mueve o ahorra.

Se prioriza por:

1. ¿Desbloquea una venta concreta a un club identificado?
2. ¿Genera o recupera dinero para el club?
3. ¿Cuántos clubes lo usarían, o es de uno solo?
4. ¿Cuánto cuesta construirlo sobre el núcleo actual?

Un pedido que solo sirve para Los Cedros y no mueve plata no entra al producto: se resuelve con configuración o no se resuelve.
