package com.terrabyte.backend.irrigation;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retires commands whose TTL passed with no report.
 *
 * <p>The third and last of the TTL's three judgements, and the one that covers
 * the cases the other two structurally cannot. The dispatcher declines to publish
 * an already-expired command and the gateway discards one that arrives too late,
 * but neither is running in the situations that matter here: an ack lost in
 * transit, a gateway that watered and then lost power, or a backend restart that
 * dropped an unpublished command on the floor. Without this sweep every one of
 * those leaves a row in ISSUED forever, which holds the pot's in-flight gate open
 * and never lets the cooldown gate see a completion.
 *
 * <p>EXPIRED is emphatically not "nothing happened". It keeps counting against
 * the daily budget at {@code granted_ml}, because the pump may well have run —
 * see {@code DeviceCommandRepository#consumedMlSince}. A late ack may still
 * correct or demote it; {@link CommandAckPhase} sets out which ones and why.
 */
@Component
public class ExpiredCommandSweeper {

    private static final Logger LOGGER = LoggerFactory.getLogger(ExpiredCommandSweeper.class);

    private final DeviceCommandRepository commandRepository;
    private final Clock clock;

    public ExpiredCommandSweeper(DeviceCommandRepository commandRepository, Clock clock) {
        this.commandRepository = commandRepository;
        this.clock = clock;
    }

    /**
     * Scheduled entry point.
     *
     * <p>{@code fixedDelay} rather than {@code fixedRate}: a slow sweep must not
     * queue up another one behind it. Nothing here throws — an exception escaping
     * a scheduled method silently cancels no further runs in Spring, but it does
     * fill the log with stack traces on every tick, and a sweep failure is worth
     * exactly one line.
     */
    @Scheduled(
            initialDelayString = "${app.irrigation.sweep.initial-delay-ms:10000}",
            fixedDelayString = "${app.irrigation.sweep.interval-ms:30000}")
    public void sweep() {
        try {
            sweepOnce();
        } catch (Exception e) {
            LOGGER.error("expiry sweep failed; the next tick will retry", e);
        }
    }

    /**
     * @return how many commands were moved to EXPIRED
     */
    public int sweepOnce() {
        Instant now = clock.instant();
        List<String> candidates = commandRepository.expirableCommandIds(now);
        if (candidates.isEmpty()) {
            return 0;
        }

        int expired = 0;
        for (String commandId : candidates) {
            // One guarded update per command rather than one bulk statement, so
            // that every transition gets its own log line. That matters more than
            // the round trips: with a two-minute TTL and hours between doses the
            // list is short, and on-hardware debugging starts from these lines.
            if (commandRepository.markExpired(commandId, now) == 1) {
                LOGGER.warn(
                        "command state ISSUED/ACCEPTED -> EXPIRED, no report arrived "
                                + "command_id={}",
                        commandId);
                expired++;
            } else {
                // Lost the race to a real ack that landed between the read and
                // the update. The device's own account beats our assumption.
                LOGGER.info("command reported itself before the sweep reached it "
                        + "command_id={}", commandId);
            }
        }
        LOGGER.info("expiry sweep expired={} of candidates={}", expired, candidates.size());
        return expired;
    }
}
