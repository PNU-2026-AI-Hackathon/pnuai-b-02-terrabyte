-- Ingested edge event ids, for at-most-once telemetry.
--
-- MQTT QoS 1 is at-least-once, so the same envelope can arrive more than once
-- after a reconnect. The edge outbox already assigns a stable UUID per event
-- and keeps it across retries, so recording that id here is enough to make
-- ingestion idempotent without the gateway having to change anything.
CREATE TABLE telemetry_event (
    event_id    VARCHAR(100) PRIMARY KEY,
    gateway_id  VARCHAR(100) NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Retention sweeps delete by age; without this they would scan the whole table.
CREATE INDEX idx_telemetry_event_ingested_at ON telemetry_event (ingested_at);
