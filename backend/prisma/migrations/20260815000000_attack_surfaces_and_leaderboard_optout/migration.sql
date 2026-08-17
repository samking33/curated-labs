-- Attack surface identification sits between architectural analysis and threat
-- identification: the learner marks where untrusted input actually enters the
-- system before naming what could go wrong there.
ALTER TYPE "lab_step" ADD VALUE IF NOT EXISTS 'attack_surfaces' AFTER 'architecture_issues';

-- Opting out hides the learner from the leaderboard without affecting their
-- own points, progress or org reporting.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "leaderboard_opt_out" BOOLEAN NOT NULL DEFAULT false;
