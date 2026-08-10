-- CreateEnum
CREATE TYPE "playground_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "playground_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playground_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playground_generation_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "status" "playground_job_status" NOT NULL DEFAULT 'queued',
    "prompt" TEXT NOT NULL,
    "error_message" TEXT,
    "idempotency_key" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playground_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playground_generated_scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content_json" JSONB NOT NULL,
    "model_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_generated_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playground_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scenario_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "current_step" "lab_step" NOT NULL DEFAULT 'intro',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playground_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playground_step_submissions" (
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

    CONSTRAINT "playground_step_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_playground_sessions_user" ON "playground_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_playground_jobs_user_created" ON "playground_generation_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_playground_jobs_org_created" ON "playground_generation_jobs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "playground_generation_jobs_user_id_idempotency_key_key" ON "playground_generation_jobs"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "playground_generated_scenarios_job_id_key" ON "playground_generated_scenarios"("job_id");

-- CreateIndex
CREATE INDEX "idx_playground_scenarios_user" ON "playground_generated_scenarios"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_playground_scenarios_session" ON "playground_generated_scenarios"("session_id");

-- CreateIndex
CREATE INDEX "idx_playground_attempts_user" ON "playground_attempts"("user_id");

-- CreateIndex
CREATE INDEX "idx_playground_attempts_scenario_user" ON "playground_attempts"("scenario_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_playground_step_submissions_attempt_step" ON "playground_step_submissions"("attempt_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "playground_step_submissions_attempt_id_idempotency_key_key" ON "playground_step_submissions"("attempt_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_generation_jobs" ADD CONSTRAINT "playground_generation_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "playground_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_generation_jobs" ADD CONSTRAINT "playground_generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_generated_scenarios" ADD CONSTRAINT "playground_generated_scenarios_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "playground_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_generated_scenarios" ADD CONSTRAINT "playground_generated_scenarios_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "playground_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_generated_scenarios" ADD CONSTRAINT "playground_generated_scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_attempts" ADD CONSTRAINT "playground_attempts_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "playground_generated_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_attempts" ADD CONSTRAINT "playground_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_attempts" ADD CONSTRAINT "playground_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_step_submissions" ADD CONSTRAINT "playground_step_submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "playground_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
