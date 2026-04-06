-- Migration 049 rollback: Remove error_category fields

-- Remove columns from run_steps
ALTER TABLE run_steps DROP COLUMN error_category;
ALTER TABLE run_steps DROP COLUMN error_subcategory;
ALTER TABLE run_steps DROP COLUMN error_severity;
ALTER TABLE run_steps DROP COLUMN exclusion_reason;

-- Remove columns from runs
ALTER TABLE runs DROP COLUMN error_category;
ALTER TABLE runs DROP COLUMN error_severity;
