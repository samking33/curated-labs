-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "account_kind" AS ENUM ('individual', 'organization');

-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('org_owner', 'org_admin', 'department_manager', 'learner');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('platform_owner', 'platform_content_manager');

-- CreateEnum
CREATE TYPE "lab_status" AS ENUM ('draft', 'review', 'published', 'archived');

-- CreateEnum
CREATE TYPE "lab_difficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "lab_step" AS ENUM ('intro', 'architecture_issues', 'threats', 'prioritization', 'mitigations', 'release_decision', 'completed');

-- CreateEnum
CREATE TYPE "priority_level" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "release_decision" AS ENUM ('ship_it', 'ship_with_conditions', 'do_not_ship');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ai_task_type" AS ENUM ('architecture_feedback', 'threat_matching', 'priority_feedback', 'mitigation_feedback', 'release_feedback', 'model_smoke_test');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "google_subject" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "account_kind" "account_kind",
    "last_login_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "absolute_expiry" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_platform_roles" (
    "user_id" UUID NOT NULL,
    "role" "platform_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "parent_department_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'learner',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_memberships" (
    "department_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("department_id","user_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "email" CITEXT NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'learner',
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_user_id" UUID NOT NULL,
    "accepted_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lab_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "business_context" TEXT NOT NULL,
    "system_context" TEXT NOT NULL,
    "difficulty" "lab_difficulty" NOT NULL,
    "estimated_minutes" INTEGER NOT NULL,
    "status" "lab_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "content_hash" TEXT NOT NULL,
    "supersedes_lab_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_dfds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "graph_json" JSONB NOT NULL,
    "preview_asset_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_dfds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_architecture_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affected_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affected_edge_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hint" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_architecture_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_threats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expected_priority" "priority_level" NOT NULL,
    "affected_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affected_edge_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accepted_aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learner_explanation" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_threats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_mitigations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_mitigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_threat_mitigations" (
    "threat_id" UUID NOT NULL,
    "mitigation_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "explanation" TEXT,

    CONSTRAINT "lab_threat_mitigations_pkey" PRIMARY KEY ("threat_id","mitigation_id")
);

-- CreateTable
CREATE TABLE "lab_release_guidance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "recommended_decision" "release_decision" NOT NULL,
    "rationale" TEXT NOT NULL,
    "suggested_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "lab_release_guidance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lab_id" UUID NOT NULL,
    "lab_version" INTEGER NOT NULL,
    "lab_content_hash" TEXT NOT NULL,
    "dfd_version" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "department_id" UUID,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "currentStep" "lab_step" NOT NULL DEFAULT 'intro',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "abandoned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lab_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_step_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "step" "lab_step" NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "answer_json" JSONB NOT NULL,
    "ai_feedback_json" JSONB,
    "deterministic_result_json" JSONB,
    "idempotency_key" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_step_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_threat_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "canonical_threat_id" UUID,
    "learner_text" TEXT NOT NULL,
    "match_confidence" DECIMAL(4,3),
    "match_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_threat_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_release_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "decision" "release_decision" NOT NULL,
    "rationale" TEXT NOT NULL,
    "conditions" TEXT,
    "ai_feedback_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_release_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL DEFAULT 'nvidia_nim',
    "model_id" TEXT NOT NULL,
    "task_type" "ai_task_type",
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "supports_json" BOOLEAN NOT NULL DEFAULT false,
    "supports_tools" BOOLEAN NOT NULL DEFAULT false,
    "supports_embeddings" BOOLEAN NOT NULL DEFAULT false,
    "context_window" INTEGER,
    "latency_ms_p50" INTEGER,
    "latency_ms_p95" INTEGER,
    "last_checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ai_model_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_type" "ai_task_type" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'nvidia_nim',
    "model_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "latency_ms" INTEGER,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "safe_metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_organizations_slug" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_departments_org" ON "departments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_slug_key" ON "departments"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "idx_org_memberships_org_role" ON "organization_memberships"("organization_id", "role");

-- CreateIndex
CREATE INDEX "idx_org_memberships_user" ON "organization_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_department_memberships_user" ON "department_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "idx_invitations_email_status" ON "invitations"("email", "status");

-- CreateIndex
CREATE INDEX "idx_invitations_org" ON "invitations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_categories_slug_key" ON "lab_categories"("slug");

-- CreateIndex
CREATE INDEX "idx_labs_category_status" ON "labs"("category_id", "status");

-- CreateIndex
CREATE INDEX "idx_labs_status" ON "labs"("status");

-- CreateIndex
CREATE INDEX "idx_labs_slug" ON "labs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "labs_slug_version_key" ON "labs"("slug", "version");

-- CreateIndex
CREATE INDEX "idx_lab_dfds_lab" ON "lab_dfds"("lab_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_dfds_lab_id_version_key" ON "lab_dfds"("lab_id", "version");

-- CreateIndex
CREATE INDEX "idx_lab_architecture_issues_lab" ON "lab_architecture_issues"("lab_id");

-- CreateIndex
CREATE INDEX "idx_lab_threats_lab" ON "lab_threats"("lab_id");

-- CreateIndex
CREATE INDEX "idx_lab_threats_category" ON "lab_threats"("category");

-- CreateIndex
CREATE UNIQUE INDEX "lab_release_guidance_lab_id_key" ON "lab_release_guidance"("lab_id");

-- CreateIndex
CREATE INDEX "idx_lab_attempts_user" ON "lab_attempts"("user_id");

-- CreateIndex
CREATE INDEX "idx_lab_attempts_lab_user" ON "lab_attempts"("lab_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_lab_attempts_org" ON "lab_attempts"("organization_id");

-- CreateIndex
CREATE INDEX "idx_lab_attempts_department" ON "lab_attempts"("department_id");

-- CreateIndex
CREATE INDEX "idx_lab_step_submissions_attempt_step" ON "lab_step_submissions"("attempt_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "lab_step_submissions_attempt_id_idempotency_key_key" ON "lab_step_submissions"("attempt_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "learner_release_decisions_attempt_id_key" ON "learner_release_decisions"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_registry_provider_model_id_task_type_key" ON "ai_model_registry"("provider", "model_id", "task_type");

-- CreateIndex
CREATE UNIQUE INDEX "idx_ai_calls_request_hash" ON "ai_calls"("request_hash");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_org_created" ON "audit_logs"("organization_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labs" ADD CONSTRAINT "labs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "lab_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labs" ADD CONSTRAINT "labs_supersedes_lab_id_fkey" FOREIGN KEY ("supersedes_lab_id") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_dfds" ADD CONSTRAINT "lab_dfds_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_architecture_issues" ADD CONSTRAINT "lab_architecture_issues_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_threats" ADD CONSTRAINT "lab_threats_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_mitigations" ADD CONSTRAINT "lab_mitigations_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_threat_mitigations" ADD CONSTRAINT "lab_threat_mitigations_threat_id_fkey" FOREIGN KEY ("threat_id") REFERENCES "lab_threats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_threat_mitigations" ADD CONSTRAINT "lab_threat_mitigations_mitigation_id_fkey" FOREIGN KEY ("mitigation_id") REFERENCES "lab_mitigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_release_guidance" ADD CONSTRAINT "lab_release_guidance_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_attempts" ADD CONSTRAINT "lab_attempts_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_attempts" ADD CONSTRAINT "lab_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_attempts" ADD CONSTRAINT "lab_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_attempts" ADD CONSTRAINT "lab_attempts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_step_submissions" ADD CONSTRAINT "lab_step_submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "lab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_threat_matches" ADD CONSTRAINT "learner_threat_matches_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "lab_step_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_threat_matches" ADD CONSTRAINT "learner_threat_matches_canonical_threat_id_fkey" FOREIGN KEY ("canonical_threat_id") REFERENCES "lab_threats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_release_decisions" ADD CONSTRAINT "learner_release_decisions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "lab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

