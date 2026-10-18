-- ============================================================================
-- Supabase setup for Nescon-LeadGuard (run once per Supabase project, as `postgres`,
-- e.g. in the Supabase SQL editor). Already applied to project qepcsziabqkszsrrytwc.
--
-- Why a dedicated role: the API server connects with its own login instead of the
-- `postgres` superuser-like account, owns the tables it migrates, and cannot alter
-- audit history.
--
-- Connection string for server/.env (Supabase session pooler, IPv4-reachable):
--   postgresql://nescon_app.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
-- ============================================================================

-- 1. Application login. Replace the password; never commit the real one.
CREATE ROLE nescon_app WITH LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE, CREATE ON SCHEMA public TO nescon_app;
GRANT nescon_app TO postgres;

-- 2. Apply prisma/migrations/*/migration.sql AS nescon_app, so it owns the tables:
--      SET ROLE nescon_app;  <migration.sql>  RESET ROLE;
--    then register it for Prisma from server/:
--      npx prisma migrate resolve --applied 20261018000000_init

-- 3. Audit history: the app may only read and append (F4.3).
ALTER TABLE "audit_events" OWNER TO postgres;
ALTER FUNCTION audit_events_append_only() OWNER TO postgres;
ALTER FUNCTION audit_events_append_only() SET search_path = '';
REVOKE ALL ON "audit_events" FROM nescon_app;
GRANT SELECT, INSERT ON "audit_events" TO nescon_app;
CREATE POLICY audit_app_read ON "audit_events" FOR SELECT TO nescon_app USING (true);
CREATE POLICY audit_app_append ON "audit_events" FOR INSERT TO nescon_app WITH CHECK (true);

-- RLS is enabled on every table by the migration with no policies for anon/authenticated,
-- so Supabase's auto-generated REST/GraphQL API cannot read or write application data.
