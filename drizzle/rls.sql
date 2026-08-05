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
