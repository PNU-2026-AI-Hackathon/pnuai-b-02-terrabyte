package com.terrabyte.backend.irrigation;

/** Which side actually issued the command. */
public enum CommandOrigin {
    CLOUD,
    /**
     * Issued by the gateway during a cloud outage and reported afterwards.
     *
     * <p>These rows are inserted after the fact, but they still count against
     * the daily budget — that is the whole point of recording them.
     */
    EDGE_FALLBACK
}
