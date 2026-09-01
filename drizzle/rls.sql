-- ============================================================
-- Aislamiento multi-tenant + protección del ledger
-- Correr DESPUÉS de la primera migración de Drizzle.
-- ============================================================

-- 1. Rol de la aplicación.
--    Importante: NO debe ser owner de las tablas ni superuser,
--    porque esos roles ignoran las políticas de RLS por defecto.
CREATE ROLE app_user NOLOGIN;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- 2. Club actual del request. Lo setea el middleware por transacción.
CREATE OR REPLACE FUNCTION current_club() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_club', true), '')::uuid
$$;

-- 3. RLS en toda tabla que tenga club_id.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'club_id'
      AND a.attnum > 0
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I
        USING (club_id = current_club())
        WITH CHECK (club_id = current_club())
    $p$, t);
  END LOOP;
END $$;

-- 4. El ledger es append-only. Un error se corrige con asiento inverso.
CREATE OR REPLACE FUNCTION deny_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries es append-only: usá un asiento de reversa';
END $$;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger_entries;
CREATE TRIGGER ledger_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();

-- 5. Saldo de cuenta corriente. Débito suma deuda, crédito la baja.
--    SECURITY INVOKER: la vista corre con los permisos del usuario que la
--    lee y respeta RLS de accounts/ledger_entries → sin set_config devuelve
--    cero filas (regla M0), nunca los saldos de otros tenants.
CREATE OR REPLACE VIEW account_balances
WITH (security_invoker = true) AS
SELECT
  a.id                AS account_id,
  a.club_id,
  a.holder_person_id,
  COALESCE(SUM(
    CASE WHEN e.direction = 'debito' THEN e.amount ELSE -e.amount END
  ), 0) AS balance
FROM accounts a
LEFT JOIN ledger_entries e ON e.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.club_id, a.holder_person_id;

-- 6. Auditoría estructural — batch_id.
--    Vive acá, no en schema.ts (ver DECISIONS.md): es infraestructura de
--    auditoría, no dominio. Agrupa N filas de una misma operación masiva
--    (ej. importación de padrón) para que la UI no muestre un muro de
--    líneas sueltas.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS audit_log_batch_idx ON audit_log (club_id, batch_id);

-- 7. Trigger genérico de auditoría estructural: registra INSERT/UPDATE/
--    DELETE de las tablas de dominio sin depender de que la app se
--    acuerde de llamar a audit(). Lee el mismo app.current_club /
--    app.current_actor / app.current_batch que setea withTenant() y que
--    lee el audit() de la app (src/lib/audit/index.ts) — así una fila
--    escrita a mano y las que genera este trigger quedan consistentes.
--
--    Excluidas a propósito: audit_log (recursión) y ledger_entries
--    (ya es append-only, trigger propio en la sección 4).
CREATE OR REPLACE FUNCTION audit_table_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_diff jsonb;
  v_action varchar(30);
  v_entity_id uuid;
  -- Columnas técnicas: nunca son "lo que cambió" desde el punto de vista
  -- de negocio, se excluyen del diff en INSERT y en UPDATE.
  v_technical_cols text[] := ARRAY['id', 'created_at', 'updated_at', 'deleted_at', 'club_id'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    SELECT jsonb_object_agg(key, value)
      INTO v_diff
      FROM jsonb_each(to_jsonb(NEW))
      WHERE key <> ALL (v_technical_cols);

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity_id := NEW.id;
    SELECT jsonb_object_agg(n.key, n.value)
      INTO v_diff
      FROM jsonb_each(to_jsonb(NEW)) n
      JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
      WHERE n.key <> ALL (v_technical_cols)
        AND n.value IS DISTINCT FROM o.value;

    IF v_diff IS NULL THEN
      -- Nada cambió fuera de columnas técnicas (ej. un UPDATE que sólo
      -- toca updated_at): no genera fila, para no meter ruido.
      RETURN NEW;
    END IF;

  ELSE -- DELETE
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_diff := NULL; -- es un borrado: no hay diff positivo que mostrar.
  END IF;

  INSERT INTO audit_log (club_id, actor_user_id, ip, batch_id, entity, entity_id, action, diff, at)
  VALUES (
    current_club(),
    (nullif(current_setting('app.current_actor', true), '')::jsonb ->> 'user_id')::uuid,
    (nullif(current_setting('app.current_actor', true), '')::jsonb ->> 'ip'),
    nullif(current_setting('app.current_batch', true), '')::uuid,
    TG_TABLE_NAME,
    v_entity_id,
    v_action,
    v_diff,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 8. Aplicar el trigger a las tablas de dominio auditables. Mismo patrón
--    que la sección 3 (DO $$ + EXECUTE format()), acá sobre una lista
--    explícita en vez de un catálogo dinámico: no todas las tablas con
--    club_id están acá (ej. teams, events, accounts quedan afuera por
--    ahora, a criterio explícito del alcance actual).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'persons', 'person_roles', 'relationships', 'memberships',
    'fee_plans', 'charges', 'payments', 'documents'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION audit_table_changes()',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- Uso desde la app (Drizzle):
--
--   await db.transaction(async (tx) => {
--     await tx.execute(sql`SELECT set_config('app.current_club', ${clubId}, true)`)
--     return tx.select().from(persons)
--   })
--
-- El `true` final hace que el setting sea LOCAL a la transacción:
-- se limpia solo y no se filtra a otro request del pool.
-- ============================================================

-- 9. Lotes de débito automático (M4.4). Vive acá y no en schema.ts a
--    propósito (ver DECISIONS.md — M4.4): es un artefacto del proceso
--    bancario, no una entidad de negocio que la app manipule directamente.
--    El lote agrupa N payments con method='debito_automatico' (externalRef
--    = 'debito:<numero>:<accountId>') y lleva su propio estado: generado →
--    acreditado (confirmación del banco) → cerrado (rechazos importados).
CREATE TABLE IF NOT EXISTS debito_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  numero varchar(30) NOT NULL,
  banco varchar(60) NOT NULL DEFAULT 'generico',
  fecha_ejecucion date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'generado',
  monto_total numeric(14, 2) NOT NULL DEFAULT 0,
  registros integer NOT NULL DEFAULT 0,
  acreditados integer NOT NULL DEFAULT 0,
  rechazados integer NOT NULL DEFAULT 0,
  generado_por uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON debito_lotes TO app_user;
ALTER TABLE debito_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debito_lotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON debito_lotes;
CREATE POLICY tenant_isolation ON debito_lotes
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE UNIQUE INDEX IF NOT EXISTS debito_lotes_club_numero_uq ON debito_lotes (club_id, numero);
CREATE INDEX IF NOT EXISTS debito_lotes_club_created_idx ON debito_lotes (club_id, created_at);

-- 10. Notificaciones. Vive acá y no en schema.ts a propósito (ver
--    DECISIONS.md — M2.2): es la bandeja de entrada de eventos de dominio,
--    no una tabla de negocio que la app manipule directamente. Se crea
--    con IF NOT EXISTS porque, a diferencia de la sección 3, acá el
--    catálogo dinámico de tablas con club_id ya no la encontró (no existía
--    cuando se corrió rls.sql por primera vez).
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  type varchar(40) NOT NULL,
  title varchar(160) NOT NULL,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO app_user;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notifications;
CREATE POLICY tenant_isolation ON notifications
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE INDEX IF NOT EXISTS notifications_club_created_idx ON notifications (club_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at);

-- 11. Morosidad y comunicaciones (M5). Vive acá y no en schema.ts por la
--    misma razón que notifications y debito_lotes: son el andamiaje del
--    proceso de cobranza, no entidades de negocio que la app edite directo.
--    message_templates = plantillas con variables editables por el club.
--    cobranza_rules = disparadores configurables sin tocar código.
--    contact_log = registro de todo contacto enviado (para no duplicar y
--    para poder demostrarlo); resolved_at cierra las sugerencias de
--    suspensión, que NUNCA son automáticas.
--    payment_plans = plan de pago que divide la deuda en N cuotas.

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  key varchar(60) NOT NULL,
  name varchar(120) NOT NULL,
  body text NOT NULL,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON message_templates TO app_user;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON message_templates;
CREATE POLICY tenant_isolation ON message_templates
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_club_key_uq ON message_templates (club_id, key);

CREATE TABLE IF NOT EXISTS cobranza_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  name varchar(120) NOT NULL,
  dias_desde_vencimiento integer NOT NULL CHECK (dias_desde_vencimiento >= 0),
  channel varchar(20) NOT NULL CHECK (channel IN ('whatsapp', 'mail', 'coordinador', 'suspension')),
  template_key varchar(60),
  dedupe_dias integer NOT NULL DEFAULT 7 CHECK (dedupe_dias >= 1),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON cobranza_rules TO app_user;
ALTER TABLE cobranza_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranza_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON cobranza_rules;
CREATE POLICY tenant_isolation ON cobranza_rules
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE INDEX IF NOT EXISTS cobranza_rules_club_idx ON cobranza_rules (club_id, enabled);

CREATE TABLE IF NOT EXISTS contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  rule_id uuid REFERENCES cobranza_rules(id),
  user_id uuid REFERENCES users(id),
  channel varchar(20) NOT NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('mensaje', 'aviso', 'sugerencia')),
  body text,
  resolved_at timestamptz,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_log TO app_user;
ALTER TABLE contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contact_log;
CREATE POLICY tenant_isolation ON contact_log
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE INDEX IF NOT EXISTS contact_log_account_delivered_idx ON contact_log (club_id, account_id, delivered_at);
CREATE INDEX IF NOT EXISTS contact_log_rule_idx ON contact_log (club_id, rule_id);

CREATE TABLE IF NOT EXISTS payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  total numeric(14, 2) NOT NULL,
  cantidad_cuotas integer NOT NULL CHECK (cantidad_cuotas >= 1),
  monto_cuota numeric(14, 2) NOT NULL,
  primera_fecha date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'completado', 'cancelado')),
  motivo varchar(200),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_plans TO app_user;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_plans;
CREATE POLICY tenant_isolation ON payment_plans
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE INDEX IF NOT EXISTS payment_plans_account_idx ON payment_plans (club_id, account_id, status);

-- 12. Suscripciones de Web Push (M6). Vive acá y no en schema.ts por la
--     misma razón que notifications: es el andamiaje del canal push, no una
--     entidad de negocio. Una fila = un navegador/dispositivo registrado
--     para recibir push del club. RLS solo por club (mismo criterio que
--     notifications): el filtro por user_id lo hacen las queries, así el
--     socio solo toca sus propias suscripciones. Endpoint único por club:
--     el mismo navegador no se duplica.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO app_user;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON push_subscriptions;
CREATE POLICY tenant_isolation ON push_subscriptions
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_club_endpoint_uq ON push_subscriptions (club_id, endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (club_id, user_id);

-- 13. Documentos y vencimientos (M7). document_types vive acá y no en
--     schema.ts por el patrón M5: es configuración transversal del club
--     (qué documentos exige, si vencen, cada cuánto avisar), no una entidad
--     que la app edite a ciegas. documents, en cambio, ya es tabla de
--     schema.ts (M1): acá solo se agregan las columnas de M7 que faltaban.
--
--     document_types: un registro por (club_id, kind) tomado del enum
--     document_kind. alert_days son los días de antelación para el aviso de
--     vencimiento (30/15/3 por defecto) — configurables por tipo.
CREATE TABLE IF NOT EXISTS document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  kind varchar(40) NOT NULL,
  label varchar(120) NOT NULL,
  requires_expiry boolean NOT NULL DEFAULT true,
  alert_days integer[] NOT NULL DEFAULT '{30,15,3}',
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON document_types TO app_user;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON document_types;
CREATE POLICY tenant_isolation ON document_types
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE UNIQUE INDEX IF NOT EXISTS document_types_club_kind_uq ON document_types (club_id, kind);

-- Columnas de M7 sobre documents (base ya creada en la migración 0000).
-- alerted_days = días de antelación ya avisados, para que el runner de
-- alertas sea idempotente entre corridas diarias (30, 15, 3).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name varchar(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type varchar(120);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason varchar(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS alerted_days integer[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS documents_club_status_idx ON documents (club_id, status);
CREATE INDEX IF NOT EXISTS documents_club_uploaded_idx ON documents (club_id, uploaded_by);

-- 14. Super Admin (M9). Tablas globales del andamiaje de administración de
--     la plataforma: NO llevan club_id y NO tienen RLS (como clubs y users),
--     porque el super admin opera sobre todos los tenants. El guard de
--     acceso vive en la app (esSuperAdmin): una consulta una fila a
--     super_admin_users por email del usuario autenticado. super_admin_log
--     es la auditoría de cada acción administrativa (quién, qué, cuándo).
--
--     Acceso: solo los emails en super_admin_users. El bootstrap inicial
--     (fede@fmcode.com) se inserta en el script db:seed:super-admin.
CREATE TABLE IF NOT EXISTS super_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  notes varchar(255),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON super_admin_users TO app_user;

CREATE TABLE IF NOT EXISTS super_admin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email varchar(255) NOT NULL,
  action varchar(40) NOT NULL,
  entity varchar(40) NOT NULL,
  entity_id uuid,
  diff jsonb,
  ip varchar(45),
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON super_admin_log TO app_user;
CREATE INDEX IF NOT EXISTS super_admin_log_entity_idx ON super_admin_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS super_admin_log_at_idx ON super_admin_log (at DESC);

-- 15. Importador (M10). El wizard parsea el archivo en el cliente (xlsx) y
--     el server valida y persiste cada corrida agrupada en un batch: el
--     batch_id viaja a audit_log con withTenant (4º arg, ver sección 6) y
--     además se inserta una fila en import_batches para la historia
--     ("importaste N personas el ..."). import_mappings recuerda, por club y
--     tipo de importación, qué columna del archivo mapea a cada campo, para
--     que la próxima vez el wizard arranque pre-mapeado. Ninguna es entidad
--     de negocio: son andamiaje del importador, viven acá (patrón M5).
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id),
  import_type varchar(30) NOT NULL,
  file_name varchar(255) NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  mapping jsonb,
  imported_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON import_batches TO app_user;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON import_batches;
CREATE POLICY tenant_isolation ON import_batches
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE INDEX IF NOT EXISTS import_batches_club_created_idx ON import_batches (club_id, created_at);

CREATE TABLE IF NOT EXISTS import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  import_type varchar(30) NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_header boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON import_mappings TO app_user;
ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON import_mappings;
CREATE POLICY tenant_isolation ON import_mappings
  USING (club_id = current_club())
  WITH CHECK (club_id = current_club());
CREATE UNIQUE INDEX IF NOT EXISTS import_mappings_club_type_uq ON import_mappings (club_id, import_type);
