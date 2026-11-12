import type { TLapRecord } from '../../modules/telemetry/lapTypings';

import { cornerSegments, findCorners } from './ghostLapModel';

/*
 * Trail braking: carrying some brake past the turn-in point and easing it off towards the apex.
 * The front tyres stay loaded, so the car turns in better and the braking zone is shorter. Each
 * corner is read on one lap from the brake and lateral G channels: where the brake comes off
 * against the apex, how much of the braking is done while already turning, and how quickly the
 * pedal is released.
 */

/** Brake pressure below this is off. */
const BRAKE_ON = 0.05;
/** Lateral G from this up is cornering. */
const TURNING_G = 0.3;
/** Brake run gaps this short (m) are one braking. */
const BRAKE_GAP_M = 6;
/** Braking is searched for this far before the apex, m. */
const SEARCH_BEFORE_M = 350;
/** And this far after it: further on, braking is for the next corner, m. */
const SEARCH_AFTER_M = 40;
/** Peak brake below this is a dab, not a braking zone worth judging. */
const MIN_PEAK_BRAKE = 0.25;
/** Brake released this far before the apex with little turning on it: braking in a straight line. */
export const STRAIGHT_RELEASE_M = 20;
/** Share of braking distance turned in below which the corner is braked in a straight line. */
export const MIN_TRAIL_SHARE = 0.15;
/** Brake held this far past the apex is over-trailing. */
export const OVER_TRAIL_M = 8;
/** A release from half pressure to off shorter than this is a step off the pedal, m. */
export const ABRUPT_RELEASE_M = 6;

export type TTrailVerdict = 'straightLine' | 'abruptRelease' | 'overTrail' | 'good';

export interface TTrailMetrics {
	/** Brake release before the apex, m; negative when braking goes on past it. */
	releaseBeforeApexM: number;
	/** Share of the braking distance driven while turning (0..1). */
	trailShare: number;
	/** Distance over which the brake falls from half of its peak to off, m. */
	releaseM: number;
	peakBrake: number;
	verdict: TTrailVerdict;
}

export interface TCornerTrail {
	corner: number;
	distance: number;
	lap: number;
	metrics: TTrailMetrics;
	/** The same corner on the lap that drove it fastest, when that is another lap. */
	fastest: { lap: number; metrics: TTrailMetrics; gainS: number } | null;
}

export interface TTrailBrakingReport {
	/** Lap the corners are read on (the best clean lap). */
	lap: number;
	corners: TCornerTrail[];
	/** Corners the brake was released before turning in. */
	straightLine: number[];
	abruptRelease: number[];
	overTrail: number[];
}

const verdictOf = (
	releaseBeforeApexM: number,
	trailShare: number,
	releaseM: number,
): TTrailVerdict => {
	if (releaseBeforeApexM < -OVER_TRAIL_M) return 'overTrail';
	if (releaseBeforeApexM > STRAIGHT_RELEASE_M && trailShare < MIN_TRAIL_SHARE) {
		return 'straightLine';
	}
	if (releaseM < ABRUPT_RELEASE_M) return 'abruptRelease';
	return 'good';
};

/** Trail braking at one corner of one lap; null when the corner is not braked for. */
export const measureTrail = (
	record: Pick<TLapRecord, 'step' | 'channels'>,
	apex: number,
	segment: [number, number],
): TTrailMetrics | null => {
	const { brake, gLat } = record.channels;
	const step = record.step;
	const from = Math.max(segment[0], apex - Math.round(SEARCH_BEFORE_M / step));
	const to = Math.min(segment[1], brake.length, apex + Math.round(SEARCH_AFTER_M / step) + 1) - 1;
	const gap = Math.max(1, Math.round(BRAKE_GAP_M / step));

	// The braking that ends closest to the apex: the last brake point up to just past the apex,
	// then back to where that braking began.
	let end = -1;
	for (let i = to; i >= from; i -= 1) {
		if (brake[i] >= BRAKE_ON) {
			end = i;
			break;
		}
	}
	if (end < 0 || end < apex - Math.round(SEARCH_BEFORE_M / step / 2)) return null;
	let start = end;
	let off = 0;
	for (let i = end - 1; i >= from; i -= 1) {
		if (brake[i] >= BRAKE_ON) {
			start = i;
			off = 0;
		} else if ((off += 1) > gap) {
			break;
		}
	}

	let peak = 0;
	let peakAt = start;
	let turning = 0;
	for (let i = start; i <= end; i += 1) {
		if (brake[i] > peak) {
			peak = brake[i];
			peakAt = i;
		}
		if (Math.abs(gLat[i]) >= TURNING_G) turning += 1;
	}
	if (peak < MIN_PEAK_BRAKE) return null;

	let half = end;
	for (let i = peakAt; i <= end; i += 1) {
		if (brake[i] < peak / 2) {
			half = i;
			break;
		}
	}
	const releaseBeforeApexM = (apex - end) * step;
	const trailShare = turning / (end - start + 1);
	const releaseM = (end - half + 1) * step;
	return {
		releaseBeforeApexM,
		trailShare,
		releaseM,
		peakBrake: peak,
		verdict: verdictOf(releaseBeforeApexM, trailShare, releaseM),
	};
};

const segmentTimeS = (record: TLapRecord, [from, to]: [number, number]): number => {
	const time = record.channels.timeMs;
	const last = Math.min(to, time.length) - 1;
	return (time[last] - time[from]) / 1000;
};

/**
 * Trail braking at every braked corner of the best lap, each next to the lap that drove that
 * corner fastest. Corners and their segments come from the best lap so every lap is cut alike.
 */
export const buildTrailBraking = (
	best: TLapRecord,
	clean: TLapRecord[],
): TTrailBrakingReport | null => {
	const laps = clean.length ? clean : [best];
	const length = Math.min(...laps.map(record => record.channels.speed.length));
	const corners = findCorners(best.channels.speed.subarray(0, length), best.step);
	if (corners.length === 0) return null;
	const segments = cornerSegments(corners, length);

	const rows: TCornerTrail[] = [];
	corners.forEach((corner, n) => {
		const segment = segments[n];
		const metrics = measureTrail(best, corner.index, segment);
		if (!metrics) return;
		const times = laps.map(record => segmentTimeS(record, segment));
		const fastestIndex = times.indexOf(Math.min(...times));
		const fastestLap = laps[fastestIndex];
		const fastestMetrics =
			fastestLap === best ? null : measureTrail(fastestLap, corner.index, segment);
		rows.push({
			corner: corner.number,
			distance: corner.distance,
			lap: best.lap,
			metrics,
			fastest: fastestMetrics
				? {
						lap: fastestLap.lap,
						metrics: fastestMetrics,
						gainS: segmentTimeS(best, segment) - times[fastestIndex],
					}
				: null,
		});
	});

	const withVerdict = (verdict: TTrailVerdict): number[] =>
		rows.filter(row => row.metrics.verdict === verdict).map(row => row.corner);
	return {
		lap: best.lap,
		corners: rows,
		straightLine: withVerdict('straightLine'),
		abruptRelease: withVerdict('abruptRelease'),
		overTrail: withVerdict('overTrail'),
	};
};
