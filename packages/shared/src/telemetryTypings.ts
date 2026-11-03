/** @format */

/** Wheel order used everywhere: front-left, front-right, rear-left, rear-right. */
export type TWheelTuple<T> = [T, T, T, T];

/** Tyre tread zones (inside, middle, outside), °C. */
export interface TTyreZones {
	inner: number;
	middle: number;
	outer: number;
}

/**
 * One normalized telemetry sample. Every source (GT7, F1 historical data, mock, replay)
 * is converted to this shape on the relay, so the UI never knows which game produced it.
 * Fields a source cannot provide are `null`; see `TSourceCapabilities`.
 */
export interface TTelemetryFrame {
	/** Session clock, ms since the source started. */
	t: number;
	lap: number;
	/** Time since the current lap started, ms. */
	lapTimeMs: number;
	/** Distance travelled since the start of the lap, m. */
	lapDistance: number;
	/** km/h */
	speed: number;
	rpm: number;
	/** -1 reverse, 0 neutral, 1..8 */
	gear: number;
	/** 0..1 */
	throttle: number;
	/** 0..1 */
	brake: number;
	/** -1 (full left) .. 1 (full right) */
	steer: number | null;
	/** Lateral acceleration, G (positive = to the right). */
	gLat: number;
	/** Longitudinal acceleration, G (positive = accelerating). */
	gLong: number;
	/** World position, m (X/Z is the ground plane). */
	x: number;
	z: number;
	/** Average tyre temperature, °C. */
	tyreTemps: TWheelTuple<number> | null;
	tyreZones: TWheelTuple<TTyreZones> | null;
	brakeTemps: TWheelTuple<number> | null;
	/** Tyre wear 0 (new) .. 1 (gone). */
	tyreWear: TWheelTuple<number> | null;
	/** Litres. */
	fuel: number | null;
	position: number | null;
}

export interface TLapSummary {
	lap: number;
	lapTimeMs: number;
	sectorsMs: number[];
	isValid: boolean;
	isPitLap: boolean;
	compound: string | null;
}

export interface TFieldEntry {
	id: string;
	name: string;
	position: number;
	lap: number;
	/** Seconds behind the leader; null for the leader or when unknown. */
	gapToLeaderS: number | null;
	/** Seconds to the car ahead. */
	intervalS: number | null;
	compound: string | null;
	tyreAgeLaps: number | null;
	isPlayer: boolean;
}

export type TSourceKind = 'mock' | 'gt7' | 'f1' | 'replay';

export interface TSourceCapabilities {
	isLive: boolean;
	hasSteering: boolean;
	hasTyreTemps: boolean;
	hasTyreZones: boolean;
	hasBrakeTemps: boolean;
	hasTyreWear: boolean;
	hasFuel: boolean;
	hasSectors: boolean;
	hasOpponents: boolean;
	/** Real G-sensor data; false when G is derived from speed/yaw. */
	hasMeasuredG: boolean;
}

export interface TSessionInfo {
	sessionId: string;
	source: TSourceKind;
	title: string;
	track: string | null;
	driver: string | null;
	trackLength: number | null;
	capabilities: TSourceCapabilities;
}
