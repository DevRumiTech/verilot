-- Enforce physical-coordinate and serial-range invariants.
ALTER TABLE "locations"
ADD CONSTRAINT "locations_latitude_range_check"
CHECK ("latitude" BETWEEN -90 AND 90),
ADD CONSTRAINT "locations_longitude_range_check"
CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "batches"
ADD CONSTRAINT "batches_serial_range_check"
CHECK ("serialStart" > 0 AND "serialEnd" >= "serialStart");

-- Corrections point to the immutable event they supersede.
ALTER TABLE "custody_events"
ADD CONSTRAINT "custody_events_correction_target_check"
CHECK (
  ("type" = 'CORRECTION' AND "correctedEventId" IS NOT NULL)
  OR ("type" <> 'CORRECTION' AND "correctedEventId" IS NULL)
);

-- Every deterministic alert is tied to one triggering source.
ALTER TABLE "alerts"
ADD CONSTRAINT "alerts_single_source_check"
CHECK (num_nonnulls("eventId", "verificationAttemptId") = 1);

-- Custody and audit history are append-only at the database boundary.
CREATE FUNCTION prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER custody_events_append_only
BEFORE UPDATE OR DELETE ON "custody_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER audit_records_append_only
BEFORE UPDATE OR DELETE ON "audit_records"
FOR EACH ROW
EXECUTE FUNCTION prevent_append_only_mutation();
