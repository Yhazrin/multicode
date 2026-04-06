-- Migration 049: Add error_category to run_steps and runs
-- Adds Failure Taxonomy fields to run_steps and runs tables

-- Add columns to run_steps
ALTER TABLE run_steps ADD COLUMN error_category VARCHAR(50);
ALTER TABLE run_steps ADD COLUMN error_subcategory VARCHAR(50);
ALTER TABLE run_steps ADD COLUMN error_severity VARCHAR(20);
ALTER TABLE run_steps ADD COLUMN exclusion_reason VARCHAR(255);

-- Add columns to runs
ALTER TABLE runs ADD COLUMN error_category VARCHAR(50);
ALTER TABLE runs ADD COLUMN error_severity VARCHAR(20);

-- Fill existing data in run_steps based on Failure Taxonomy Spec v0.2
-- Spec v0.2 L1 categories: AGENT_ERROR, TOOL_ERROR, POLICY_VIOLATION, TIMEOUT, RESOURCE_EXHAUSTION, USER_CANCELLED, SYSTEM_ERROR, DEPENDENCY_FAILURE, UNKNOWN
UPDATE run_steps
SET error_category = CASE
    WHEN step_type = 'error' AND tool_name = '' THEN 'AGENT_ERROR'
    WHEN is_error = true AND tool_name = '' AND step_type != 'error' THEN 'SYSTEM_ERROR'
    WHEN is_error = true AND tool_name != '' THEN 'TOOL_ERROR'
    WHEN exclusion_reason ILIKE '%timeout%' THEN 'TIMEOUT'
    WHEN exclusion_reason ILIKE '%connection%' OR exclusion_reason ILIKE '%unavailable%' OR exclusion_reason ILIKE '%service%' THEN 'DEPENDENCY_FAILURE'
    WHEN exclusion_reason ILIKE '%policy%' OR exclusion_reason ILIKE '%deny%' OR exclusion_reason ILIKE '%SQL Guard%' THEN 'POLICY_VIOLATION'
    WHEN exclusion_reason ILIKE '%human%' OR exclusion_reason ILIKE '%user%' OR exclusion_reason ILIKE '%confirm%' THEN 'USER_CANCELLED'
    WHEN exclusion_reason ILIKE '%token%' OR exclusion_reason ILIKE '%limit%' OR exclusion_reason ILIKE '%quota%' THEN 'RESOURCE_EXHAUSTION'
    ELSE 'UNKNOWN'
END,
error_severity = CASE
    WHEN step_type = 'error' AND tool_name = '' THEN 'FATAL'
    WHEN is_error = true AND tool_name = '' AND step_type != 'error' THEN 'PERMANENT'
    WHEN is_error = true AND tool_name != '' THEN 'RECOVERABLE'
    WHEN exclusion_reason ILIKE '%timeout%' THEN 'TRANSIENT'
    WHEN exclusion_reason ILIKE '%connection%' OR exclusion_reason ILIKE '%unavailable%' OR exclusion_reason ILIKE '%service%' THEN 'TRANSIENT'
    WHEN exclusion_reason ILIKE '%policy%' OR exclusion_reason ILIKE '%deny%' OR exclusion_reason ILIKE '%SQL Guard%' THEN 'PERMANENT'
    WHEN exclusion_reason ILIKE '%human%' OR exclusion_reason ILIKE '%user%' OR exclusion_reason ILIKE '%confirm%' THEN 'TRANSIENT'
    WHEN exclusion_reason ILIKE '%token%' OR exclusion_reason ILIKE '%limit%' OR exclusion_reason ILIKE '%quota%' THEN 'PERMANENT'
    ELSE 'UNKNOWN'
END;

-- Fill existing data in runs (from last error step)
UPDATE runs
SET error_category = (
    SELECT error_category
    FROM run_steps
    WHERE run_id = runs.id AND is_error = true
    ORDER BY seq DESC
    LIMIT 1
),
error_severity = (
    SELECT error_severity
    FROM run_steps
    WHERE run_id = runs.id AND is_error = true
    ORDER BY seq DESC
    LIMIT 1
)
WHERE phase IN ('failed', 'cancelled') AND error_category IS NULL;
