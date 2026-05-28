-- Migration: Soft deletes, composite indexes, and audit_logs table
-- Generated for schema improvements

-- ── Soft delete columns ────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- ── New indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users" ("deleted_at");
CREATE INDEX IF NOT EXISTS "sessions_deleted_at_idx" ON "sessions" ("deleted_at");
CREATE INDEX IF NOT EXISTS "tasks_deleted_at_idx" ON "tasks" ("deleted_at");
CREATE INDEX IF NOT EXISTS "tasks_session_status_idx" ON "tasks" ("session_id", "status");

-- ── Audit logs table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "action" varchar(100) NOT NULL,
  "resource_type" varchar(50) NOT NULL,
  "resource_id" uuid,
  "changes" jsonb DEFAULT '{}',
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
