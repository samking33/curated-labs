-- Remember the difficulty a generation was asked for, so a job orphaned by a
-- restart resumes as the learner requested instead of at the default.
ALTER TABLE "playground_generation_jobs" ADD COLUMN "difficulty" "lab_difficulty";
