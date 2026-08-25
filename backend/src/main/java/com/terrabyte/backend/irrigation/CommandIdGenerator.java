package com.terrabyte.backend.irrigation;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;

import org.springframework.stereotype.Component;

/**
 * Generates command ids as ULIDs: 26 characters of Crockford base32 over a
 * 48-bit millisecond timestamp followed by 80 bits of randomness.
 *
 * <p>Two properties are why this is not just a UUID. The id is generated before
 * the insert, so an authorisation can hand a command id to the caller without a
 * database round trip; and because the timestamp is the high-order part, ids
 * sort lexicographically by issue time, which makes "the most recent commands
 * for this pot" an index range scan on the primary key rather than a sort.
 *
 * <p>Implemented by hand against {@link SecureRandom} rather than pulling in a
 * ULID library — the whole algorithm is the twenty lines below, and a new
 * dependency is not worth it.
 */
@Component
public class CommandIdGenerator {

    /** Crockford base32: no I, L, O or U, so an id read aloud is unambiguous. */
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private static final int TIMESTAMP_CHARS = 10;
    private static final int RANDOM_CHARS = 16;
    /** 2^48 ms ≈ year 10889; beyond that the timestamp would silently wrap. */
    private static final long MAX_TIMESTAMP = (1L << 48) - 1;

    private final SecureRandom random = new SecureRandom();
    private final Clock clock;

    public CommandIdGenerator() {
        this(Clock.systemUTC());
    }

    /** For tests that need to pin the timestamp half. */
    public CommandIdGenerator(Clock clock) {
        this.clock = clock;
    }

    public String next() {
        return next(clock.instant());
    }

    public String next(Instant issuedAt) {
        long timestamp = issuedAt.toEpochMilli();
        if (timestamp < 0 || timestamp > MAX_TIMESTAMP) {
            throw new IllegalArgumentException("Timestamp outside the 48-bit ULID range: " + timestamp);
        }
        char[] out = new char[TIMESTAMP_CHARS + RANDOM_CHARS];
        // Most significant character first, so string order matches time order.
        encode(timestamp, out, 0, TIMESTAMP_CHARS);
        // 80 random bits, taken as two 40-bit halves because 40 bits is the
        // largest chunk that divides evenly into 5-bit base32 characters.
        encode(random.nextLong() & 0xFF_FFFF_FFFFL, out, TIMESTAMP_CHARS, 8);
        encode(random.nextLong() & 0xFF_FFFF_FFFFL, out, TIMESTAMP_CHARS + 8, 8);
        return new String(out);
    }

    private static void encode(long value, char[] out, int offset, int length) {
        for (int i = length - 1; i >= 0; i--) {
            out[offset + i] = ALPHABET[(int) (value & 0x1F)];
            value >>>= 5;
        }
    }
}
