package com.terrabyte.backend.measurement;

/** PPFD 값이 어디서 나왔는지. 프론트가 "추정" 표시를 붙일 근거다. */
public enum PpfdBasis {
    USER_SELECTED,
    INFERRED_FROM_SPACE_TYPE,
    LEGACY_DEVICE_VALUE
}
