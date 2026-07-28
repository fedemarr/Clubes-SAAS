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

CREATE TRIGGER ledger_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();

-- 5. Saldo de cuenta corriente. Débito suma deuda, crédito la baja.
CREATE OR REPLACE VIEW account_balances AS
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
