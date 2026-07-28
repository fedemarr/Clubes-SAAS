CREATE TYPE "public"."charge_status" AS ENUM('pendiente', 'parcial', 'pagado', 'vencido', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('apto_medico', 'dni', 'consentimiento_imagen', 'consentimiento_tutor', 'seguro', 'ficha_federativa', 'otro');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pendiente', 'vigente', 'vencido', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('debito', 'credito');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('entrenamiento', 'partido', 'evento_social', 'asamblea', 'turno_voluntario');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pendiente', 'activa', 'suspendida', 'baja');--> statement-breakpoint
CREATE TYPE "public"."participation_status" AS ENUM('convocado', 'presente', 'ausente', 'justificado', 'lesionado');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('efectivo', 'transferencia', 'debito_automatico', 'mercado_pago', 'tarjeta', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pendiente', 'acreditado', 'rechazado', 'reversado');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('prospecto', 'pendiente_aprobacion', 'activo', 'inactivo', 'baja');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('tutor_de', 'conyuge_de', 'hermano_de');--> statement-breakpoint
CREATE TYPE "public"."role_kind" AS ENUM('jugador', 'tutor', 'entrenador', 'manager', 'coordinador', 'preparador_fisico', 'medico', 'secretaria', 'tesorero', 'presidente', 'directivo', 'empleado', 'socio_no_deportivo');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"holder_person_id" uuid NOT NULL,
	"label" varchar(120),
	"virtual_cvu" varchar(30),
	"virtual_alias" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"entity" varchar(60) NOT NULL,
	"entity_id" uuid,
	"action" varchar(30) NOT NULL,
	"diff" jsonb,
	"ip" varchar(45),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"membership_id" uuid,
	"period" varchar(7) NOT NULL,
	"concept" varchar(160) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"due_on" date NOT NULL,
	"status" charge_status DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"locality" varchar(120),
	"logo_url" text,
	"branding" jsonb,
	"sport_pack" jsonb,
	"timezone" varchar(60) DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"file_key" text NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"status" "document_status" DEFAULT 'pendiente' NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"team_id" uuid,
	"kind" "event_kind" NOT NULL,
	"title" varchar(160),
	"location" varchar(160),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"opponent" varchar(120),
	"meta" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"sport" varchar(40),
	"amount" numeric(14, 2) NOT NULL,
	"sibling_discounts" jsonb,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"charge_id" uuid,
	"payment_id" uuid,
	"reverses_entry_id" uuid,
	"memo" varchar(200),
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"fee_plan_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'pendiente' NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "participation_status" DEFAULT 'convocado' NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"account_id" uuid,
	"method" "payment_method" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"status" "payment_status" DEFAULT 'pendiente' NOT NULL,
	"external_ref" varchar(120),
	"raw_payload" jsonb,
	"recorded_by" uuid,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "role_kind" NOT NULL,
	"scope_team_id" uuid,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid,
	"doc_type" varchar(12) DEFAULT 'DNI' NOT NULL,
	"doc_number" varchar(20),
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"born_on" date,
	"email" varchar(255),
	"phone" varchar(40),
	"photo_url" text,
	"member_number" integer,
	"status" "person_status" DEFAULT 'pendiente_aprobacion' NOT NULL,
	"custom" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"related_person_id" uuid NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"position" varchar(40),
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"sport" varchar(40) NOT NULL,
	"label" varchar(60) NOT NULL,
	"season" integer NOT NULL,
	"birth_year_from" integer,
	"birth_year_to" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_holder_person_id_persons_id_fk" FOREIGN KEY ("holder_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_related_person_id_persons_id_fk" FOREIGN KEY ("related_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_club_idx" ON "accounts" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_cvu_uq" ON "accounts" USING btree ("virtual_cvu");--> statement-breakpoint
CREATE INDEX "audit_club_at_idx" ON "audit_log" USING btree ("club_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_membership_period_uq" ON "charges" USING btree ("membership_id","period","concept");--> statement-breakpoint
CREATE INDEX "charges_account_status_idx" ON "charges" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "charges_club_due_idx" ON "charges" USING btree ("club_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_slug_uq" ON "clubs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "documents_person_idx" ON "documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "documents_club_expires_idx" ON "documents" USING btree ("club_id","expires_on");--> statement-breakpoint
CREATE INDEX "events_club_starts_idx" ON "events" USING btree ("club_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_team_idx" ON "events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "fee_plans_club_idx" ON "fee_plans" USING btree ("club_id","valid_from");--> statement-breakpoint
CREATE INDEX "ledger_account_booked_idx" ON "ledger_entries" USING btree ("account_id","booked_at");--> statement-breakpoint
CREATE INDEX "ledger_club_booked_idx" ON "ledger_entries" USING btree ("club_id","booked_at");--> statement-breakpoint
CREATE INDEX "memberships_account_idx" ON "memberships" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "memberships_person_idx" ON "memberships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "memberships_club_status_idx" ON "memberships" USING btree ("club_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "participations_uq" ON "participations" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "participations_person_idx" ON "participations" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_ref_uq" ON "payments" USING btree ("club_id","external_ref");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payments_unreconciled_idx" ON "payments" USING btree ("club_id","reconciled_at");--> statement-breakpoint
CREATE INDEX "person_roles_person_idx" ON "person_roles" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_roles_club_role_idx" ON "person_roles" USING btree ("club_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_club_doc_uq" ON "persons" USING btree ("club_id","doc_number");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_club_member_no_uq" ON "persons" USING btree ("club_id","member_number");--> statement-breakpoint
CREATE INDEX "persons_club_idx" ON "persons" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "persons_user_idx" ON "persons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "persons_lastname_idx" ON "persons" USING btree ("club_id","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_uq" ON "relationships" USING btree ("person_id","related_person_id","kind");--> statement-breakpoint
CREATE INDEX "relationships_related_idx" ON "relationships" USING btree ("related_person_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_person_idx" ON "team_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_club_label_season_uq" ON "teams" USING btree ("club_id","sport","label","season");--> statement-breakpoint
CREATE INDEX "teams_club_idx" ON "teams" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");