package com.terrabyte.backend.measurement;

import java.sql.Timestamp;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TelemetryEventRepository {

    private final JdbcTemplate jdbcTemplate;

    public TelemetryEventRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Claim an event id, returning false when it was already ingested.
     *
     * <p>{@code ON CONFLICT DO NOTHING} makes the check and the insert one
     * statement. The conflict target is left off deliberately: {@code event_id}
     * is the table's only unique constraint, so the untargeted form means the
     * same thing on PostgreSQL while also being accepted by H2 in the tests. Reading first and then inserting would let two concurrent
     * deliveries of the same envelope both pass the read, which is precisely
     * the race that QoS 1 redelivery produces.
     */
    public boolean claim(String eventId, String gatewayId, Instant observedAt, Instant now) {
        int inserted = jdbcTemplate.update(
                """
                INSERT INTO telemetry_event (event_id, gateway_id, observed_at, ingested_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                """,
                eventId,
                gatewayId,
                Timestamp.from(observedAt),
                Timestamp.from(now));
        return inserted == 1;
    }

    public int deleteIngestedBefore(Instant cutoff) {
        return jdbcTemplate.update(
                "DELETE FROM telemetry_event WHERE ingested_at < ?", Timestamp.from(cutoff));
    }
}
