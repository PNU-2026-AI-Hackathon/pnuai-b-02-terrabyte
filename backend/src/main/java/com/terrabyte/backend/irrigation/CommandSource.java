package com.terrabyte.backend.irrigation;

/**
 * Who asked for water.
 *
 * <p>Recorded on every decision so a later question of "why did this pot get
 * watered at 3am" has an answer. It never affects the gates except that
 * {@link #MANUAL} may override the cooldown, and even then only the cooldown.
 */
public enum CommandSource {
    /** The rule engine decided water was needed and used a fixed volume. */
    RULE,
    /** The rule engine decided, and the AI server sized the dose. */
    RULE_AI,
    /** A person pressed a button in the app. */
    MANUAL,
    /** The Orange Pi watered on its own while the cloud was unreachable. */
    EDGE_FALLBACK
}
