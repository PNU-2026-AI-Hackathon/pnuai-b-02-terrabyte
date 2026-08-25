package com.terrabyte.backend.irrigation;

/** Why a well-formed manual light request was not issued. */
public enum LightDenyReason {
    /** No gateway and node pair can currently address this pot. */
    NO_ADDRESSABLE_NODE,
    /** A previous light transition is still awaiting its terminal acknowledgement. */
    IN_FLIGHT
}
