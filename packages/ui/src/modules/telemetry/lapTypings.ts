import { TWheelTuple } from '@racing/shared';

export const LAP_CHANNELS = [
	'timeMs',
	'speed',
	'throttle',
	'brake',
	'gear',
	'rpm',
	'gLat',
	'x',
	'z',
] as const;

export type TLapChannel = (typeof LAP_CHANNELS)[number];

/** A completed lap resampled onto a fixed distance grid, the base for analysis and strategy. */
export interface TLapRecord {
	lap: number;
	lapTimeMs: number;
	sectorsMs: number[];
	isValid: boolean;
	isPitLap: boolean;
	compound: string | null;
	/** Grid step, m. */
	step: number;
	/** Factor the measured distance was stretched by to match the track length (1 = untouched). */
	distanceScale: number;
	/** Distance of each grid point, m. */
	distance: Float32Array;
	channels: Record<TLapChannel, Float32Array>;
	/** Mean tyre temperature over the lap, °C. */
	tyreTempAvg: TWheelTuple<number> | null;
	/** Tyre wear (0..1) when the lap ended. */
	tyreWearEnd: TWheelTuple<number> | null;
	fuelStart: number | null;
	fuelEnd: number | null;
}
