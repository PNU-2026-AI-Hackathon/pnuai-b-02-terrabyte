-- Commands actually sent to an actuator, and what the device reported back.
--
-- This is the table the daily-budget gate sums over, so a missing or
-- mis-stated row here translates directly into over-watering.
--
-- Deviation from docs/design/edge_ai_hardening.md: numbered V21 rather than
-- V12 (V11 is telemetry_event and V12-V19 are the commerce migrations), and
-- TIMESTAMPTZ is spelled
-- TIMESTAMP WITH TIME ZONE so the migration also runs on H2 in PostgreSQL
-- mode, which the test profile uses.
CREATE TABLE device_command (
    -- ULID rather than a sequence: it is generated before the insert (the
    -- grant carries it), it is safe to hand to an untrusted edge device, and
    -- it sorts lexicographically by issue time.
    command_id VARCHAR(40) PRIMARY KEY,
    pot_id BIGINT NOT NULL REFERENCES pot (id) ON DELETE CASCADE,
    correlation_id VARCHAR(64) NOT NULL,
    actuator VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    granted_ml INTEGER,
    -- The device's own watchdog bound. It stops the pump even if the volume
    -- feedback never arrives.
    max_runtime_ms INTEGER NOT NULL,
    state VARCHAR(20) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    acked_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    -- Reported by the device. NULL means "we never heard how much ran", which
    -- is not the same as zero — see consumedMlSince in DeviceCommandRepository.
    actual_ml INTEGER,
    actual_runtime_ms INTEGER,
    stop_cause VARCHAR(30),
    origin VARCHAR(20) NOT NULL,
    CONSTRAINT ck_device_command_state CHECK (state IN
        ('ISSUED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'ABORTED', 'EXPIRED'))
);

-- Serves both the in-flight gate (pot + state) and the budget sum (pot + time).
CREATE INDEX ix_device_command_pot_state ON device_command (pot_id, state, issued_at DESC);
