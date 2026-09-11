-- Runs once after every `prisma migrate deploy`, using the full-privilege
-- owner connection (the dcms_app role itself cannot grant/revoke its own
-- rights). Tables must already exist for REVOKE to apply, which is why this
-- can't live in the Postgres init script (see database/init/01-app-role.sh) -
-- that runs before migrations have created anything.
--
-- Goal: even if application code has a bug, or is fully compromised, it
-- physically cannot rewrite or erase the audit trail or a patient's medical
-- history - "no hard delete" becomes a database guarantee, not just an
-- absent API endpoint (docs review DCMS-018).
REVOKE UPDATE, DELETE ON audit_logs FROM dcms_app;
REVOKE DELETE ON patients, clinical_alerts, patient_timeline_events FROM dcms_app;
-- Corrections to these facts are appended as new records, never overwritten.
REVOKE UPDATE, DELETE ON patient_timeline_events, dialysis_readings,
  dialysis_events, lab_results, clinical_notes, medication_administrations,
  prescription_dispenses, stock_movements, machine_status_history FROM dcms_app;
