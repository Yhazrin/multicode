-- Fix missing UUID defaults on run tables.
-- The runs table may have been created without gen_random_uuid() defaults
-- if 039_run_orchestrator.up.sql was not applied (migration naming conflict
-- with 039_outbox).

ALTER TABLE runs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE run_steps ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE run_todos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE run_artifacts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE run_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE run_handoffs ALTER COLUMN id SET DEFAULT gen_random_uuid();
