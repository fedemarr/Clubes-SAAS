# Club-SAAS: Prompt maestro para expansión completa

> Pegar íntegro en Claude Code. Modo Plan. Lee CLAUDE.md y ROADMAP.md antes de responder.

---

## CONTEXTO

M0 y M1 están completos y verificados en producción. El sistema funciona. Ahora necesita tres cosas:

1. **Mejora visual:** rediseño completo inspirado en el portal de San Miguel Rugby
2. **Super admin:** herramientas para vos (solo tú) para gestionar clubs y configuración
3. **Herramientas operativas:** importador, exportador, documentos

Stack cerrado: Next.js 15, Tailwind, Drizzle, Neon, Auth.js. Nada cambia. Si detectás que algo no cabe, pregunta de qué prescindir, no propongas alternativas.

---

## 1. MEJORA VISUAL Y DISEÑO

### 1.1 Inspiración: Portal de San Miguel Rugby

El sistema debe verse como el portal que viste en el video. Elementos clave a copiar:

**Encabezado del perfil del socio:**
- Foto de perfil grande con avatar fallback (iniciales)
- Nombre completo destacado (tipografía grande, peso 600+)
- DNI/documento debajo
- Badge de categoría (Plantel Superior, M15, etc.)
- Indicador visual de límites ("Cambios de foto agotados")

**Estado de cuota:**
- Badge de color (verde = al día, rojo = vencido, amarillo = próximo a vencer)
- Tarjeta de débito automático con toggle (visual, no interactivo aún):
  * "Débito automático activo"
  * Monto y fecha ("Tu cuota se cobra sola cada mes $XX.XXX")
  * Botón "Cancelar" (visual, sin funcionalidad)
- Check verde: "Estás al día - No tenés cuotas pendientes"
- Sección de historial de pagos (transacciones anteriores)

**Credencial digital:**
- Botón prominente "Mostrar QR"
- Botones para Apple Wallet / Google Wallet (ambos con "Actualizar")
- Al expandir QR: código grande, nombre, DNI, estado, texto "Se renueva automáticamente"

**Beneficios y descuentos:**
- Tarjeta destacada: "60% en estacionamiento - Descuento para socios"
- Sección de beneficios dinámicos (configurable por club)

### 1.2 Rediseño de todas las pantallas

**Dashboard admin (presidente/tesorero):**
- KPIs grandes y claros (personas activas, deuda total, cobrado hoy)
- Gráfico de morosidad (línea, últimos 6 meses)
- Tarjetas de módulos con icono + descripción + "Abrir"
- Color primario del club (desde clubs.branding.primary)

**Padrón (personas):**
- Tabla densa con 4 columnas max por defecto
- Acciones (editar, ver detalles) al hover
- Filtros collapsables (no múltiples dropdowns)
- Buscador global con autocompletado

**Categorías:**
- Cards por deporte (Hockey, Rugby) con ícono
- Listar sub-categorías dentro
- Botón "+ Nueva" floante

**Calendario/Eventos:**
- Vista de mes/semana/día (selector simple)
- Eventos como bloques con color por tipo
- Tooltip al hover con detalles

**Cuotas:**
- Tabs: Planes | Membresías | Generación | Historial
- Cada tab con su propia tabla/vista

### 1.3 Sistema de colores y tipografía

**Colores:**
- Primario: `clubs.branding.primary` (Los Cedros = verde oscuro #1B5E20)
- Secundario: gris neutro (para backgrounds y borders)
- Semáforo de estados:
  * Verde (#22C55E): al día, vigente, activo
  * Rojo (#EF4444): vencido, deuda, crítico
  * Amarillo (#FBBF24): próximo a vencer, atención
  * Gris (#6B7280): inactivo, baja

**Tipografía:**
- Fuente: Geist o Inter (ya en Tailwind)
- Encabezados: peso 600, tamaño según nivel (h1=32px, h2=24px, h3=20px)
- Cuerpo: peso 400, 14px
- Datos numéricos: peso 500 (monoespacio si es moneda)

**Espaciado:**
- Padding interno de cards: 1.5rem
- Gap entre elementos: 1rem
- Máximo ancho: 1280px, centrado

### 1.4 Mobile first (380px mínimo)

- Cards apiladas verticalmente
- Tablas se convierten en listas (una fila = un card)
- Acciones (botones) ocupan el 100% del ancho en mobile
- Modales fullscreen en mobile
- Scroll horizontal solo si es inevitable

---

## 2. SUPER ADMIN (NUEVO ROL)

Solo tú (Fede) tienes este rol. Acceso: `/super-admin`.

### 2.1 Requisitos de acceso

- Validación hardcodeada: solo `fede@fmcode.com` (o la que definas) puede acceder
- Sin pasar por RLS de club (es global, no tenant-scoped)
- Auditoría de cada acción en tabla nueva `super_admin_log`

### 2.2 Vistas

**Dashboard de clubs:**
- Tabla con: nombre, slug, socios activos, deuda total, last_activity
- Acciones: editar, ver datos, suspender (soft), eliminar (soft)

**Configuración de club (drill-down a cada club):**

**Tab: General**
- Nombre del club (texto)
- Slug (auto-generado, editable)
- Localidad (texto)
- Timezone (select)
- Logo URL (input, preview)
- Branding (color primario, color secundario) — color pickers
- Tagline (textarea corta)

**Tab: Sport packs**
- Card por deporte (Rugby, Hockey, Fútbol, Básquet)
- Cada card muestra:
  * Posiciones configuradas (Rugby: Hooker, Prop, etc.)
  * Divisiones/categorías (M10, M12, M15, etc.)
  * Tipo de partido (Test, Liga, Amistoso)
  * Botón "Editar"
- Botón "+ Agregar deporte"

**Tab: Planes de cuota**
- Tabla: nombre, deporte, monto, vigencia (desde/hasta), estado
- Acciones: editar, desactivar, ver historial de precios
- Botón "+ Nuevo plan"

**Tab: Categorías**
- Tabla: label, deporte, años (from/to), estado
- Acciones: editar, desactivar
- Botón "+ Nueva categoría"

**Tab: Auditoría**
- Tabla: quién, qué, cuándo, dónde (IP), cambio (before/after en JSON)
- Filtrar por: usuario, tipo de entidad, fecha range
- Exportar log

**Tab: Miembros del staff** (del club)
- Tabla: email, rol, acceso desde, último login
- Acciones: cambiar rol, revocar acceso, impersonar (para debug)

### 2.3 Permiso en la base de datos

Nueva tabla: `super_admin_users` (solo `super_admin` role puede escribir)
```sql
CREATE TABLE super_admin_users (
  id UUID PRIMARY KEY,
  email VARCHAR NOT NULL UNIQUE,
  secret_key VARCHAR NOT NULL, -- para autenticación adicional si querés
  created_at TIMESTAMP DEFAULT NOW()
);
```

Trigger: toda acción de super-admin escribe en `super_admin_log`.

---

## 3. IMPORTADOR DE DATOS

Interfaz paso a paso. Acceso: `/[club]/admin/importador` (solo super-admin y presidente del club).

### 3.1 Flujo

**Paso 1: Seleccionar tipo de importación**
- Personas (nuevo padrón)
- Cuotas (histórico de cobros)
- Ambas (recomendado: primero personas, luego cuotas)

**Paso 2: Subida de archivo**
- Drag-and-drop o file input
- Soporta: .xlsx, .xls, .csv
- Máximo 10MB
- Muestra preview de primeras 5 filas

**Paso 3: Mapeo de columnas**
- Detecta encabezados automáticamente
- Columnas requeridas: apellido, nombre, DNI (o algún identificador)
- Columnas opcionales: email, teléfono, fecha nacimiento, categoría, deporte, estado
- Interfaz: drag-drop o select de cada columna del archivo → campo del sistema
- Memoria: guarda mapeo por club, lo sugiere en próximas importaciones

**Paso 4: Validación**
- Row by row:
  * DNI duplicado: ¿crear como nueva persona o vincular?
  * Nombre vacío: error
  * Email inválido: warning, no error
  * Categoría no existe: crear automáticamente o error?
  * Fecha nacimiento futura: error
- Reporte: N válidas, N con error, N skipped
- Descargar CSV de errores

**Paso 5: Previsualización**
- Tabla con lo que va a importar
- Muestra: acción (crear / actualizar / skip), nuevos datos vs viejos
- Botón "Atrás" (volver a paso 4)
- Botón "Importar"

**Paso 6: Confirmación**
- Spinner mientras corre la importación (en background)
- Mostrar progreso: "Importando 450 de 700..."
- Al terminar: resumen (X creadas, Y actualizadas, Z skipped)
- Generar batch_id visible (UUID corto, ej "imp-2026-08-31-abc123")
- Botón "Ver detalle" → abre la auditoría del lote

### 3.2 Manejo de datos sucios

- Nombres en mayúscula: convertir a Title Case
- DNI con puntos (ej "12.345.678"): limpiar a "12345678"
- Fechas en múltiples formatos: detectar y standarizar
- Espacios extra: trim()
- Caracteres especiales en DNI: rechazar solo si impiden identificación única

### 3.3 Validación de negocio

- Un DNI no puede estar en dos clubs (constraint en DB)
- Un socio no puede estar en dos categorías del mismo deporte simultáneamente
- Menor sin tutor: permitir crear como "prospecto", no como "activo"

---

## 4. EXPORTADOR

Acceso: cualquier rol que pueda ver los datos (presidente, coordinador, tesorero).

### 4.1 Qué exportar

**Personas**
- Filtros: categoría, estado, deporte, con/sin deuda
- Columnas seleccionables: nombre, DNI, email, teléfono, categoría, fecha nac, estado
- Archivo: Excel con 2 sheets (datos + notas de auditoría)

**Movimientos de cuota**
- Filtro: período (mes/año range), tipo (cargo/pago/ajuste), estado, categoría
- Columnas: fecha, concepto, monto, estado, acreedor/deudor, comprobante
- Totales por tipo al final

**Estado de cuenta de familia**
- Seleccionar familia (autocomplete)
- Rango de fechas
- Sheet 1: resumen (saldo, deuda, última actualización)
- Sheet 2: detalle de movimientos
- Sheet 3: próximas cuotas vencidas

### 4.2 Formato Excel

- Header con logo/nombre del club
- Fecha de exportación
- Nombre del que exportó
- Colores: primario del club en encabezados
- Números: formato moneda (ARS)
- Fechas: DD/MM/YYYY
- Descargable con nombre: `{club-slug}_{tipo}_{fecha}.xlsx`

---

## 5. MÓDULO DOCUMENTOS (REPARAR)

Acceso: cualquiera puede subir los suyos, staff ve todos.

### 5.1 Tipos de documentos

- Apto médico
- DNI (frente + dorso)
- Consentimiento de tutor (firmas electrónicas)
- Consentimiento de imagen (menores)
- Seguro
- Fichas federativas
- Otro

### 5.2 Subida

- Zona drop o file input
- Soporta: PDF, JPG, PNG
- Máximo 5MB por archivo
- Exif removal automático (privacidad)
- Validar: "¿Cuándo vence?" (date picker)

### 5.3 Almacenamiento

- Guardar en R2 con `club_id/person_id/document_type/fecha.ext`
- URL firmada de 5 minutos (no compartible)
- Encriptación en reposo (configurar en R2)
- Nunca URLs públicas

### 5.4 Vistas

**Como persona:**
- Mis documentos (solo los míos)
- Mostrar: tipo, estado (vigente/vencido/por vencer), fecha emisión/vencimiento
- Botón subir nuevo
- Botón descargar (si tienes permiso)

**Como staff:**
- Documentos de la categoría/club (filtrable)
- Alertas: "15 aptos vencidos", "30 consentimientos pendientes"
- Bulk actions: aprobar, rechazar, recordar al socio

### 5.5 Estados

- Pendiente (subido, sin revisar)
- Vigente (aprobado, dentro de fecha)
- Vencido (pasó fecha)
- Rechazado (staff no aprobó, necesita resubir)

---

## 6. INTEGRACIÓN CON WEBAPP ACTUAL

**Contexto:** tienes un sistema paralelo con equipos, jugadores, asistencia, etc. Necesitamos unificar.

**Preguntas que necesito respondidas para avanzar:**

1. ¿En qué base está la webapp actual? (¿Neon, otra DB, mismo DB diferente schema?)
2. ¿Qué tablas/entidades tiene? (jugadores, equipos, asistencia, etc.)
3. ¿Cómo identifica a una persona? (¿mismo DNI que persons?)
4. ¿Hay datos reales ahí o es de prueba?

**Plan tentativo (asumiendo misma base de Neon, schema separado):**
- Migrar datos a `persons`, `teams`, `events`, `participations`
- Dropear el schema viejo
- Mantener URLs old → redirect a nuevas
- Batch_id de migración para auditoría

---

## 7. ORDEN DE IMPLEMENTACIÓN

1. **Mejora visual (Semana 1):** rediseño de componentes, colores, layout
2. **Super admin (Semana 1):** vista clubs, configuración general, logs
3. **Importador (Semana 2):** paso a paso, validación, batch_id
4. **Documentos (Semana 2):** subida, almacenamiento en R2, vistas
5. **Exportador (Semana 2):** Excel format, múltiples tipos
6. **Integración webapp (Semana 3):** según respuestas de preguntas

---

## 8. CHECKLIST ANTES DE IMPLEMENTAR

Respondé estas preguntas antes de que Claude Code empiece:

**Design & UX:**
- [ ] ¿Los colores del club (Los Cedros) están bien identificados? (hoy parece ser verde oscuro)
- [ ] ¿Usamos roboto/inter/geist? (confirma fuente del sistema)
- [ ] ¿El breakpoint mobile es 380px o menor?

**Super admin:**
- [ ] ¿Qué email tiene acceso al super-admin? (hardcode)
- [ ] ¿Cuántos clubs esperás gestionar inicialmente? (diseño para 1-100)

**Importador:**
- [ ] ¿El archivo de entrada viene siempre con DNI o hay variantes?
- [ ] ¿Permitimos crear categorías sobre la marcha o solo asignar existentes?
- [ ] ¿Edad mínima de un socio? (para validar fecha nacimiento)

**Documentos:**
- [ ] ¿R2 ya está configurado en .env? (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)
- [ ] ¿Quién aprueba documentos: solo staff o también personas?

**Webapp actual:**
- [ ] [RESPONDER PRIMERO] Base de datos, tablas, identificación de personas

---

## 9. STACK CONFIRMADO

**Nada cambia.** Todo lo que sigue debe respetar:

- Next.js 15, App Router, TypeScript strict
- Drizzle ORM contra Neon (sa-east-1)
- Tailwind + shadcn/ui
- Auth.js
- Cloudflare R2 para archivos
- Vercel para deploy
- RLS para aislamiento multi-tenant
- Auditoría en dos niveles (app + trigger)

**Si algo no cabe, pregunta de qué prescindir, no propongas herramientas nuevas.**

---

## 10. CUÁNDO EMPEZAR

Respondé el **Checklist** y la **sección 6 (preguntas de webapp)**, pegá este prompt completo en Claude Code en modo Plan, y decime cuándo está listo para que lo revise antes de aprobarlo.

**Tiempo estimado:**
- Plan + revisión: 1 hora
- Implementación: 3 semanas
- Testing + polish: 1 semana

**Hito de salida:** sistema listo para presentar a Los Cedros con visual professional, super-admin funcional, importador operativo, documentos guardados.
