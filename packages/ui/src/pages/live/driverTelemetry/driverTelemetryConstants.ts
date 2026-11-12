import { TSourceKind } from '@racing/shared';

export const TRACE_WINDOWS_S = [10, 30, 60] as const;
export const DEFAULT_TRACE_WINDOW_S = 30;
export const GG_TRAIL_MS = 6000;
export const READOUT_HZ = 12;

export const PLAYBACK_RATES = [1, 2, 4, 8, 16, 32, 64];
/** Fastest speed each replayed source accepts (the relay clamps to the same values). */
export const MAX_PLAYBACK_RATE: Partial<Record<TSourceKind, number>> = {
	mock: 8,
	f1: 16,
	replay: 64,
};
