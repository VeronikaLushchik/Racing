import type { TLapRecord } from '../../modules/telemetry/lapTypings';

/** A corner found on the reference lap: the slowest point between two straights. */
export interface TCorner {
	number: number;
	/** Grid index of the apex (minimum speed). */
	index: number;
	distance: number;
	minSpeed: number;
}

export type TCornerInsightKind =
	| 'lateBrakeSlowExit'
	| 'earlyBrakeFastExit'
	| 'lateBrake'
	| 'earlyBrake'
	| 'moreApexSpeed'
	| 'lessApexSpeed'
	| 'lateThrottle'
	| 'earlyThrottle'
	| 'slowerSameInputs'
	| 'fasterSameInputs'
	| 'similar';

export interface TCornerInsight {
	kind: TCornerInsightKind;
	/** Positive numbers for the translation pattern, already rounded. */
	args: number[];
}

/** How the compared lap drove a corner relative to the reference lap. */
export interface TCornerComparison {
	corner: TCorner;
	/** Positive: the compared lap starts braking later, m. Null when one lap did not brake. */
	brakePointDeltaM: number | null;
	/** Positive: the compared lap carries more minimum speed, km/h. */
	minSpeedDeltaKmh: number;
	/** Positive: the compared lap reaches full throttle later, m. */
	throttlePointDeltaM: number | null;
	/** Positive: the compared lap is faster on the exit, km/h. */
	exitSpeedDeltaKmh: number;
	/** Positive: the compared lap loses time in this corner's segment, s. */
	timeDeltaS: number;
	insight: TCornerInsight;
}

export interface TCornerMetrics {
	brakePoint: number | null;
	minSpeed: number;
	throttlePoint: number | null;
	exitSpeed: number;
}

const SMOOTH_POINTS = 3;
const MIN_SPEED_DROP_KMH = 12;
const MIN_CORNER_GAP_M = 120;
const BRAKE_ON = 0.1;
const BRAKE_SEARCH_M = 400;
const FULL_THROTTLE = 0.9;
const APEX_WINDOW_M = 40;
const EXIT_OFFSET_M = 100;

const BRAKE_THRESHOLD_M = 5;
const SPEED_THRESHOLD_KMH = 2;
const THROTTLE_THRESHOLD_M = 10;
const TIME_THRESHOLD_S = 0.1;

const smooth = (values: ArrayLike<number>, radius: number): Float32Array => {
	const result = new Float32Array(values.length);
	for (let i = 0; i < values.length; i += 1) {
		let sum = 0;
		let count = 0;
		for (
			let j = Math.max(0, i - radius);
			j <= Math.min(values.length - 1, i + radius);
			j += 1
		) {
			sum += values[j];
			count += 1;
		}
		result[i] = sum / count;
	}
	return result;
};

const maxIn = (values: ArrayLike<number>, from: number, to: number): number => {
	let max = -Infinity;
	for (let i = Math.max(0, from); i <= Math.min(values.length - 1, to); i += 1) {
		max = Math.max(max, values[i]);
	}
	return max;
};

const minIndexIn = (values: ArrayLike<number>, from: number, to: number): number => {
	let best = Math.max(0, from);
	for (let i = best; i <= Math.min(values.length - 1, to); i += 1) {
		if (values[i] < values[best]) {
			best = i;
		}
	}
	return best;
};

/**
 * Corners are local minima of speed that sit at least `MIN_SPEED_DROP_KMH` below the fastest
 * point since the previous corner, and at least half that below the fastest point before the
 * next one. Minima closer than `MIN_CORNER_GAP_M` count as one corner (chicanes stay one).
 */
export const findCorners = (speed: ArrayLike<number>, step: number): TCorner[] => {
	const smoothed = smooth(speed, SMOOTH_POINTS);
	const radius = Math.max(1, Math.round(MIN_CORNER_GAP_M / 2 / step));

	const candidates: number[] = [];
	for (let i = 1; i < smoothed.length - 1; i += 1) {
		const from = Math.max(0, i - radius);
		const to = Math.min(smoothed.length - 1, i + radius);
		if (minIndexIn(smoothed, from, to) === i) {
			candidates.push(i);
		}
	}

	const apexes: number[] = [];
	candidates.forEach((index, n) => {
		const previous = apexes[apexes.length - 1] ?? 0;
		const next = candidates[n + 1] ?? smoothed.length - 1;
		const entryDrop = maxIn(smoothed, previous, index) - smoothed[index];
		const exitDrop = maxIn(smoothed, index, next) - smoothed[index];
		if (entryDrop >= MIN_SPEED_DROP_KMH && exitDrop >= MIN_SPEED_DROP_KMH / 2) {
			apexes.push(index);
		}
	});

	return apexes.map((index, n) => ({
		number: n + 1,
		index,
		distance: index * step,
		minSpeed: speed[index],
	}));
};

/** Index ranges [start, end) of each corner's segment: from midway after the previous apex. */
export const cornerSegments = (corners: TCorner[], length: number): [number, number][] =>
	corners.map((corner, n) => {
		const previous = corners[n - 1];
		const next = corners[n + 1];
		const start = previous ? Math.round((previous.index + corner.index) / 2) : 0;
		const end = next ? Math.round((corner.index + next.index) / 2) : length;
		return [start, end];
	});

/** Brake point, apex speed, full-throttle point and exit speed of one lap at one corner. */
export const measureCorner = (
	lap: Pick<TLapRecord, 'step' | 'channels'>,
	apexIndex: number,
	segment: [number, number],
): TCornerMetrics => {
	const { speed, brake, throttle } = lap.channels;
	const step = lap.step;
	const last = Math.min(segment[1], speed.length) - 1;
	const windowPoints = Math.round(APEX_WINDOW_M / step);

	const apex = minIndexIn(
		speed,
		apexIndex - windowPoints,
		Math.min(last, apexIndex + windowPoints),
	);

	let brakePoint: number | null = null;
	const searchFrom = Math.max(segment[0], apex - Math.round(BRAKE_SEARCH_M / step));
	for (let i = apex; i >= searchFrom; i -= 1) {
		if (brake[i] >= BRAKE_ON) {
			brakePoint = i;
		} else if (brakePoint !== null) {
			break;
		}
	}

	let throttlePoint: number | null = null;
	for (let i = apex; i <= last; i += 1) {
		if (throttle[i] >= FULL_THROTTLE) {
			throttlePoint = i;
			break;
		}
	}

	const exitIndex = Math.min(last, apex + Math.round(EXIT_OFFSET_M / step));

	return {
		brakePoint: brakePoint === null ? null : brakePoint * step,
		minSpeed: speed[apex],
		throttlePoint: throttlePoint === null ? null : throttlePoint * step,
		exitSpeed: speed[exitIndex],
	};
};

/** Elapsed-time difference along the lap, s. Positive: `compare` is behind `reference`. */
export const buildDeltaSeries = (
	reference: Pick<TLapRecord, 'channels'>,
	compare: Pick<TLapRecord, 'channels'>,
): Float32Array => {
	const length = Math.min(reference.channels.timeMs.length, compare.channels.timeMs.length);
	const delta = new Float32Array(length);
	for (let i = 0; i < length; i += 1) {
		delta[i] = (compare.channels.timeMs[i] - reference.channels.timeMs[i]) / 1000;
	}
	return delta;
};

const round = (value: number): number => Math.round(Math.abs(value));

/** The single most telling difference in a corner, as a translation-ready insight. */
export const describeCorner = (
	brakePointDeltaM: number | null,
	minSpeedDeltaKmh: number,
	throttlePointDeltaM: number | null,
	exitSpeedDeltaKmh: number,
	timeDeltaS = 0,
): TCornerInsight => {
	const brake = brakePointDeltaM ?? 0;
	const throttle = throttlePointDeltaM ?? 0;

	if (brake >= BRAKE_THRESHOLD_M && exitSpeedDeltaKmh <= -SPEED_THRESHOLD_KMH) {
		return { kind: 'lateBrakeSlowExit', args: [round(brake), round(exitSpeedDeltaKmh)] };
	}
	if (brake <= -BRAKE_THRESHOLD_M && exitSpeedDeltaKmh >= SPEED_THRESHOLD_KMH) {
		return { kind: 'earlyBrakeFastExit', args: [round(brake), round(exitSpeedDeltaKmh)] };
	}
	if (brake >= BRAKE_THRESHOLD_M) {
		return { kind: 'lateBrake', args: [round(brake)] };
	}
	if (brake <= -BRAKE_THRESHOLD_M) {
		return { kind: 'earlyBrake', args: [round(brake)] };
	}
	if (minSpeedDeltaKmh >= SPEED_THRESHOLD_KMH) {
		return { kind: 'moreApexSpeed', args: [round(minSpeedDeltaKmh)] };
	}
	if (minSpeedDeltaKmh <= -SPEED_THRESHOLD_KMH) {
		return { kind: 'lessApexSpeed', args: [round(minSpeedDeltaKmh)] };
	}
	if (throttle >= THROTTLE_THRESHOLD_M) {
		return { kind: 'lateThrottle', args: [round(throttle)] };
	}
	if (throttle <= -THROTTLE_THRESHOLD_M) {
		return { kind: 'earlyThrottle', args: [round(throttle)] };
	}
	// Same inputs but a different time: grip, traffic or a tow, not technique.
	const seconds = Math.round(Math.abs(timeDeltaS) * 100) / 100;
	if (timeDeltaS >= TIME_THRESHOLD_S) {
		return { kind: 'slowerSameInputs', args: [seconds] };
	}
	if (timeDeltaS <= -TIME_THRESHOLD_S) {
		return { kind: 'fasterSameInputs', args: [seconds] };
	}
	return { kind: 'similar', args: [] };
};

/** Corner-by-corner comparison of `compare` against `reference` (corners come from `reference`). */
export const compareLaps = (
	reference: Pick<TLapRecord, 'step' | 'channels'>,
	compare: Pick<TLapRecord, 'step' | 'channels'>,
): TCornerComparison[] => {
	const length = Math.min(reference.channels.speed.length, compare.channels.speed.length);
	const corners = findCorners(reference.channels.speed.subarray(0, length), reference.step);
	const segments = cornerSegments(corners, length);
	const delta = buildDeltaSeries(reference, compare);

	return corners.map((corner, n) => {
		const segment = segments[n];
		const a = measureCorner(reference, corner.index, segment);
		const b = measureCorner(compare, corner.index, segment);

		const brakePointDeltaM =
			a.brakePoint !== null && b.brakePoint !== null ? b.brakePoint - a.brakePoint : null;
		const throttlePointDeltaM =
			a.throttlePoint !== null && b.throttlePoint !== null
				? b.throttlePoint - a.throttlePoint
				: null;
		const minSpeedDeltaKmh = b.minSpeed - a.minSpeed;
		const exitSpeedDeltaKmh = b.exitSpeed - a.exitSpeed;
		const timeDeltaS = delta[segment[1] - 1] - delta[segment[0]];

		return {
			corner,
			brakePointDeltaM,
			minSpeedDeltaKmh,
			throttlePointDeltaM,
			exitSpeedDeltaKmh,
			timeDeltaS,
			insight: describeCorner(
				brakePointDeltaM,
				minSpeedDeltaKmh,
				throttlePointDeltaM,
				exitSpeedDeltaKmh,
				timeDeltaS,
			),
		};
	});
};
