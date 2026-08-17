-- The attack-surface step needs its own AI task type (so its calls are
-- accounted separately in ai_calls) and its own point reason.
ALTER TYPE "ai_task_type" ADD VALUE IF NOT EXISTS 'attack_surface_feedback' AFTER 'architecture_feedback';
ALTER TYPE "point_reason" ADD VALUE IF NOT EXISTS 'attack_surface_identified' AFTER 'architecture_submitted';
