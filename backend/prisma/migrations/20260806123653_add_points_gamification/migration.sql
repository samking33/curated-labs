-- CreateEnum
CREATE TYPE "point_reason" AS ENUM ('architecture_submitted', 'threat_matched', 'threats_clean_sweep', 'priority_correct', 'mitigation_correct', 'release_submitted', 'lab_completed');

-- CreateTable
CREATE TABLE "point_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "attempt_id" UUID NOT NULL,
    "reason" "point_reason" NOT NULL,
    "amount" INTEGER NOT NULL,
    "ref_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_point_events_user" ON "point_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_point_events_org" ON "point_events"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_events_attempt_id_reason_ref_id_key" ON "point_events"("attempt_id", "reason", "ref_id");

-- AddForeignKey
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "lab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
