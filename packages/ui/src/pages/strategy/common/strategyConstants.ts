/** Tyre wear (0..1) treated as the end of a usable set. */
export const WEAR_LIMIT = 0.7;
export const FORECAST_LAPS = 10;
/** Warn when a tyre leaves its window or wears out within this many laps. */
export const WARNING_LAPS = 3;
/** Warn when the fuel-corrected degradation is above this, s per lap. */
export const HIGH_DEGRADATION_S = 0.15;
export const MAX_DELAY_LAPS = 10;
/** Beyond this many laps a trend is shown as stable. */
export const MANY_LAPS = 99;
