import type { TLapRecord } from '../../modules/telemetry/lapTypings';

import {
	cornerSegments,
	describeCorner,
	findCorners,
	measureCorner,
	TCornerInsight,
} from './ghostLapModel';
import { adviseSetup, TSetupAdvice, TSetupEvidence, TSetupValues } from './setupAdvisorModel';
import { buildTrailBraking, TTrailBrakingReport } from './trailBrakingModel';
import { fitLine } from './tyreDegradationModel';
import { TWeatherAdvice, TWeatherView, weatherAdvice } from './weatherModel';

/*
 * Post-session report: everything the dashboard knows about a session, boiled down to what a
 * race engineer would say in the debrief. It only reads completed lap records (resampled by
 * distance), the setup evidence and the weather, so it works the same for every source: GT7,
 * the demo, a replay, a loaded file or real F1 data.
 *
 * Clean laps are valid, not in/out laps and within 107% of the best lap. Everything about pace
 * and consistency uses clean laps only, so a spin or a pit stop does not hide the real picture.
 *
 * Corners come from the best lap. For each corner the fastest version of it across the clean
 * laps is the target: the best lap minus what it lost to those versions is the ideal lap, and
 * the corners where it lost most are the first things to work on.
 */

/** Laps slower than this share of the best lap are not race pace (qualifying 107% rule). */
export const OUTLIER_RATIO = 1.07;
/** Throttle above which the driver counts as flat out. */
const FULL_THROTTLE = 0.95;
const PEDAL_ON = 0.05;
const THROTTLE_ON = 0.1;
/** Below this the car is in the pits or parked, km/h: not coasting. */
const COASTING_MIN_SPEED_KMH = 30;

/** Coasting share of lap time worth a remark. */
export const COASTING_SHARE = 0.06;
/** Share of lap time with both pedals pressed worth a remark. */
export const OVERLAP_SHARE = 0.02;
/** Lap-time spread (standard deviation over mean) that means pace is not repeatable. */
export const LAP_SPREAD_RATIO = 0.008;
/** Brake-point spread in one corner worth a remark, m. */
export const BRAKE_SPREAD_M = 8;
/** Apex-speed spread in one corner worth a remark, km/h. */
export const APEX_SPREAD_KMH = 4;
/** Pace change per lap that counts as a trend, s. */
export const TREND_S_PER_LAP = 0.15;
/** Share of invalid laps that points to track limits. */
export const INVALID_SHARE = 0.25;
/** Corner time left on the table below this is noise, s. */
export const MIN_CORNER_GAIN_S = 0.03;
/** Average time lost to the best lap above which consistency is worth working on, s. */
export const CONSISTENCY_GAIN_S = 0.3;
/** Improvements listed in the report. */
const MAX_IMPROVEMENTS = 6;

export interface TReportLap {
	lap: number;
	lapTimeMs: number;
	sectorsMs: number[];
	/** Behind the best lap, ms (0 for the best lap). */
	deltaToBestMs: number;
	isValid: boolean;
	isPitLap: boolean;
	/** Slower than 107% of the best lap. */
	isOutlier: boolean;
	isClean: boolean;
	isBest: boolean;
}

export interface TSectorStats {
	bestMs: number;
	bestLap: number;
	meanMs: number;
	stdDevMs: number;
	/** Best lap's time in this sector minus the best sector, ms. */
	bestLapLossMs: number;
}

export interface TPedalShares {
	/** Shares of lap time, 0..1. */
	fullThrottle: number;
	braking: number;
	coasting: number;
	overlap: number;
}

export interface TCornerStats {
	number: number;
	distance: number;
	/** Fastest time through this corner's segment over the clean laps, s. */
	bestTimeS: number;
	bestLap: number;
	/** Best lap's time in the segment minus the fastest, s. */
	bestLapLossS: number;
	/** Average time lost to the fastest version over the clean laps, s. */
	meanLossS: number;
	/** Standard deviation of the brake point, m; null when the corner is taken flat. */
	brakeSpreadM: number | null;
	/** Standard deviation of the minimum speed, km/h. */
	apexSpreadKmh: number;
	bestApexKmh: number;
	meanApexKmh: number;
	/** What the fastest version did differently from the best lap; null when it is the best lap. */
	insight: TCornerInsight | null;
}

export type TDrivingFindingId =
	| 'coasting'
	| 'overlap'
	| 'lapSpread'
	| 'brakeSpread'
	| 'apexSpread'
	| 'improving'
	| 'fading'
	| 'trackLimits'
	| 'trailStraight'
	| 'trailAbrupt'
	| 'trailOver';

export interface TDrivingFinding {
	id: TDrivingFindingId;
	/** Numbers and corner lists for the translation pattern. */
	args: (number | string)[];
}

export type TImprovement =
	| {
			kind: 'corner';
			gainS: number;
			corner: number;
			/** Lap where the corner was driven fastest. */
			fromLap: number;
			insight: TCornerInsight | null;
	  }
	| { kind: 'sector'; gainS: number; sector: number; fromLap: number }
	| { kind: 'consistency'; gainS: number }
	| { kind: 'setup'; gainS: null; advice: TSetupAdvice };

export interface TSessionSummary {
	lapCount: number;
	cleanLapCount: number;
	invalidLapCount: number;
	bestLap: number | null;
	bestLapMs: number | null;
	meanCleanMs: number | null;
	stdDevCleanMs: number | null;
	/** Clean laps within 1% of the best one. */
	lapsNearBest: number;
	/** Sum of best sectors, ms. */
	theoreticalBestMs: number | null;
	/** Best lap with every corner driven as well as in any clean lap, ms. */
	idealLapMs: number | null;
	/** Lap-time change per lap over the clean laps, s; null with fewer than 3. */
	trendSPerLap: number | null;
	distanceKm: number;
}

export interface TSessionReport {
	summary: TSessionSummary;
	laps: TReportLap[];
	sectors: TSectorStats[];
	/** Sectors were cut in equal thirds by distance because the source has none. */
	isSyntheticSectors: boolean;
	corners: TCornerStats[];
	pedals: { best: TPedalShares; mean: TPedalShares } | null;
	findings: TDrivingFinding[];
	setupAdvice: TSetupAdvice[];
	/** Frames the setup advice is based on (0: no live data, e.g. laps restored after a reload). */
	setupFrames: number;
	weatherAdvice: TWeatherAdvice[];
	improvements: TImprovement[];
	/** Trail braking at each braked corner of the best lap; null without corners. */
	trailBraking: TTrailBrakingReport | null;
}

export interface TSessionReportInput {
	records: TLapRecord[];
	evidence: TSetupEvidence | null;
	setup: TSetupValues | null;
	tyreWindowC: { min: number; max: number };
	weather: TWeatherView | null;
}

const mean = (values: number[]): number =>
	values.reduce((sum, value) => sum + value, 0) / values.length;

const stdDev = (values: number[]): number => {
	if (values.length < 2) {
		return 0;
	}
	const average = mean(values);
	return Math.sqrt(
		values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
	);
};

const argMin = (values: number[]): number =>
	values.reduce((best, value, index) => (value < values[best] ? index : best), 0);

/** Time spent between grid points `from` and `to` (exclusive end), ms. */
const segmentTimeMs = (record: TLapRecord, from: number, to: number): number => {
	const time = record.channels.timeMs;
	const end = Math.min(to, time.length) - 1;
	// The last segment runs to the line: use the lap time, the grid may stop short of it.
	const endTime = to >= time.length ? record.lapTimeMs : time[end];
	return endTime - time[Math.max(0, from)];
};

/** How the lap time splits between pedal states, weighted by time, not distance. */
export const pedalShares = (record: TLapRecord): TPedalShares => {
	const { timeMs, throttle, brake, speed } = record.channels;
	let total = 0;
	const sums = { fullThrottle: 0, braking: 0, coasting: 0, overlap: 0 };
	for (let i = 0; i < timeMs.length - 1; i += 1) {
		const dt = timeMs[i + 1] - timeMs[i];
		if (!(dt > 0)) {
			continue;
		}
		total += dt;
		const isBraking = brake[i] >= PEDAL_ON;
		const isThrottle = throttle[i] >= THROTTLE_ON;
		if (throttle[i] >= FULL_THROTTLE) sums.fullThrottle += dt;
		if (isBraking) sums.braking += dt;
		if (isBraking && isThrottle) sums.overlap += dt;
		if (!isBraking && !isThrottle && speed[i] >= COASTING_MIN_SPEED_KMH) sums.coasting += dt;
	}
	if (total === 0) {
		return { fullThrottle: 0, braking: 0, coasting: 0, overlap: 0 };
	}
	return {
		fullThrottle: sums.fullThrottle / total,
		braking: sums.braking / total,
		coasting: sums.coasting / total,
		overlap: sums.overlap / total,
	};
};

/** Sector times of every lap: from the source when all clean laps have them, else thirds. */
export const lapSectors = (
	records: TLapRecord[],
	clean: TLapRecord[],
): { sectors: Map<number, number[]>; isSynthetic: boolean } => {
	const count = clean[0]?.sectorsMs.length ?? 0;
	const hasReal =
		count >= 2 &&
		clean.every(
			record =>
				record.sectorsMs.length === count && record.sectorsMs.every(value => value > 0),
		);
	const sectors = new Map<number, number[]>();
	records.forEach(record => {
		if (hasReal && record.sectorsMs.length === count) {
			sectors.set(record.lap, record.sectorsMs);
			return;
		}
		const length = record.channels.timeMs.length;
		const first = Math.floor(length / 3);
		const second = Math.floor((2 * length) / 3);
		sectors.set(record.lap, [
			segmentTimeMs(record, 0, first + 1),
			segmentTimeMs(record, first, second + 1),
			segmentTimeMs(record, second, length),
		]);
	});
	return { sectors, isSynthetic: !hasReal };
};

const buildCorners = (best: TLapRecord, clean: TLapRecord[]): TCornerStats[] => {
	const length = Math.min(...clean.map(record => record.channels.speed.length));
	const corners = findCorners(best.channels.speed.subarray(0, length), best.step);
	const segments = cornerSegments(corners, length);
	return corners.map((corner, n) => {
		const segment = segments[n];
		const times = clean.map(record => segmentTimeMs(record, segment[0], segment[1]) / 1000);
		const metrics = clean.map(record => measureCorner(record, corner.index, segment));
		const fastest = argMin(times);
		const bestIndex = clean.indexOf(best);
		const brakePoints = metrics
			.map(metric => metric.brakePoint)
			.filter((value): value is number => value !== null);
		const apexes = metrics.map(metric => metric.minSpeed);
		const reference = metrics[bestIndex];
		const target = metrics[fastest];
		const lossS = times[bestIndex] - times[fastest];
		return {
			number: corner.number,
			distance: corner.distance,
			bestTimeS: times[fastest],
			bestLap: clean[fastest].lap,
			bestLapLossS: lossS,
			meanLossS: mean(times) - times[fastest],
			brakeSpreadM: brakePoints.length >= 2 ? stdDev(brakePoints) : null,
			apexSpreadKmh: stdDev(apexes),
			bestApexKmh: Math.max(...apexes),
			meanApexKmh: mean(apexes),
			insight:
				fastest === bestIndex
					? null
					: describeCorner(
							reference.brakePoint !== null && target.brakePoint !== null
								? target.brakePoint - reference.brakePoint
								: null,
							target.minSpeed - reference.minSpeed,
							reference.throttlePoint !== null && target.throttlePoint !== null
								? target.throttlePoint - reference.throttlePoint
								: null,
							target.exitSpeed - reference.exitSpeed,
							-lossS,
						),
		};
	});
};

const averageShares = (shares: TPedalShares[]): TPedalShares => ({
	fullThrottle: mean(shares.map(item => item.fullThrottle)),
	braking: mean(shares.map(item => item.braking)),
	coasting: mean(shares.map(item => item.coasting)),
	overlap: mean(shares.map(item => item.overlap)),
});

const percentOf = (share: number): number => Math.round(share * 100);

/** The debrief for one session. Needs at least one completed lap. */
export const buildSessionReport = (input: TSessionReportInput): TSessionReport | null => {
	const { records, evidence, setup, tyreWindowC, weather } = input;
	if (records.length === 0) {
		return null;
	}

	const candidates = records.filter(record => record.isValid && !record.isPitLap);
	const pool = candidates.length ? candidates : records;
	const best = pool.reduce((a, b) => (b.lapTimeMs < a.lapTimeMs ? b : a));
	const isOutlier = (record: TLapRecord) => record.lapTimeMs > best.lapTimeMs * OUTLIER_RATIO;
	const clean = candidates.filter(record => !isOutlier(record));
	// Corners and sectors need the best lap among the laps they compare.
	const compared = clean.includes(best) ? clean : [best];

	const laps: TReportLap[] = records.map(record => ({
		lap: record.lap,
		lapTimeMs: record.lapTimeMs,
		sectorsMs: [],
		deltaToBestMs: record.lapTimeMs - best.lapTimeMs,
		isValid: record.isValid,
		isPitLap: record.isPitLap,
		isOutlier: isOutlier(record),
		isClean: clean.includes(record),
		isBest: record === best,
	}));

	const { sectors: sectorTimes, isSynthetic } = lapSectors(records, compared);
	laps.forEach(lap => {
		lap.sectorsMs = sectorTimes.get(lap.lap) ?? [];
	});
	const bestSectors = sectorTimes.get(best.lap) ?? [];
	const sectors: TSectorStats[] = bestSectors.map((_, index) => {
		const times = compared.map(
			record => (sectorTimes.get(record.lap) ?? [])[index] ?? Infinity,
		);
		const fastest = argMin(times);
		return {
			bestMs: times[fastest],
			bestLap: compared[fastest].lap,
			meanMs: mean(times),
			stdDevMs: stdDev(times),
			bestLapLossMs: bestSectors[index] - times[fastest],
		};
	});

	const corners = compared.length >= 2 ? buildCorners(best, compared) : [];
	const cleanTimes = clean.map(record => record.lapTimeMs);
	const meanCleanMs = cleanTimes.length ? mean(cleanTimes) : null;
	const stdDevCleanMs = cleanTimes.length >= 2 ? stdDev(cleanTimes) : null;
	const trendSPerLap =
		clean.length >= 3
			? fitLine(
					clean.map(record => record.lap),
					clean.map(record => record.lapTimeMs / 1000),
				).slope
			: null;
	const idealLapMs = corners.length
		? best.lapTimeMs - corners.reduce((sum, corner) => sum + corner.bestLapLossS, 0) * 1000
		: null;

	const summary: TSessionSummary = {
		lapCount: records.length,
		cleanLapCount: clean.length,
		invalidLapCount: records.filter(record => !record.isValid).length,
		bestLap: best.lap,
		bestLapMs: best.lapTimeMs,
		meanCleanMs,
		stdDevCleanMs,
		lapsNearBest: clean.filter(record => record.lapTimeMs <= best.lapTimeMs * 1.01).length,
		theoreticalBestMs: sectors.length
			? sectors.reduce((sum, sector) => sum + sector.bestMs, 0)
			: null,
		idealLapMs,
		trendSPerLap,
		distanceKm:
			records.reduce((sum, record) => sum + record.distance[record.distance.length - 1], 0) /
			1000,
	};

	const pedals = compared.length
		? { best: pedalShares(best), mean: averageShares(compared.map(pedalShares)) }
		: null;

	const findings: TDrivingFinding[] = [];
	if (pedals && pedals.mean.coasting >= COASTING_SHARE) {
		findings.push({ id: 'coasting', args: [percentOf(pedals.mean.coasting)] });
	}
	if (pedals && pedals.mean.overlap >= OVERLAP_SHARE) {
		findings.push({ id: 'overlap', args: [percentOf(pedals.mean.overlap)] });
	}
	if (meanCleanMs !== null && stdDevCleanMs !== null && clean.length >= 3) {
		if (stdDevCleanMs / meanCleanMs >= LAP_SPREAD_RATIO) {
			findings.push({ id: 'lapSpread', args: [Number((stdDevCleanMs / 1000).toFixed(2))] });
		}
	}
	if (compared.length >= 3) {
		const brakeCorners = corners
			.filter(corner => corner.brakeSpreadM !== null && corner.brakeSpreadM >= BRAKE_SPREAD_M)
			.map(corner => `T${corner.number}`);
		if (brakeCorners.length) {
			findings.push({ id: 'brakeSpread', args: [brakeCorners.join(', '), BRAKE_SPREAD_M] });
		}
		const apexCorners = corners
			.filter(corner => corner.apexSpreadKmh >= APEX_SPREAD_KMH)
			.map(corner => `T${corner.number}`);
		if (apexCorners.length) {
			findings.push({ id: 'apexSpread', args: [apexCorners.join(', '), APEX_SPREAD_KMH] });
		}
	}
	if (trendSPerLap !== null && trendSPerLap <= -TREND_S_PER_LAP) {
		findings.push({ id: 'improving', args: [Number(Math.abs(trendSPerLap).toFixed(2))] });
	} else if (trendSPerLap !== null && trendSPerLap >= TREND_S_PER_LAP) {
		findings.push({ id: 'fading', args: [Number(trendSPerLap.toFixed(2))] });
	}
	const trailBraking = buildTrailBraking(best, compared);
	const cornerList = (numbers: number[]): string => numbers.map(n => `T${n}`).join(', ');
	if (trailBraking?.straightLine.length) {
		findings.push({ id: 'trailStraight', args: [cornerList(trailBraking.straightLine)] });
	}
	if (trailBraking?.overTrail.length) {
		findings.push({ id: 'trailOver', args: [cornerList(trailBraking.overTrail)] });
	}
	if (trailBraking?.abruptRelease.length) {
		findings.push({ id: 'trailAbrupt', args: [cornerList(trailBraking.abruptRelease)] });
	}
	if (records.length >= 4 && summary.invalidLapCount / records.length >= INVALID_SHARE) {
		findings.push({ id: 'trackLimits', args: [summary.invalidLapCount] });
	}

	const setupAdvice =
		evidence && evidence.frames > 0
			? adviseSetup(evidence, setup, {
					tyreWindowC,
					trackTempC: weather?.trackTempC ?? null,
				})
			: [];

	const improvements: TImprovement[] = [];
	if (corners.length) {
		corners
			.filter(corner => corner.bestLapLossS >= MIN_CORNER_GAIN_S)
			.forEach(corner =>
				improvements.push({
					kind: 'corner',
					gainS: corner.bestLapLossS,
					corner: corner.number,
					fromLap: corner.bestLap,
					insight: corner.insight,
				}),
			);
	} else {
		sectors.forEach((sector, index) => {
			if (sector.bestLapLossMs / 1000 >= MIN_CORNER_GAIN_S) {
				improvements.push({
					kind: 'sector',
					gainS: sector.bestLapLossMs / 1000,
					sector: index + 1,
					fromLap: sector.bestLap,
				});
			}
		});
	}
	if (meanCleanMs !== null && clean.length >= 3) {
		const gainS = (meanCleanMs - best.lapTimeMs) / 1000;
		if (gainS >= CONSISTENCY_GAIN_S) {
			improvements.push({ kind: 'consistency', gainS });
		}
	}
	improvements.sort((a, b) => (b.gainS ?? 0) - (a.gainS ?? 0));
	const ranked = improvements.slice(0, MAX_IMPROVEMENTS);
	// The strongest setup finding closes the list: it changes the car, not the driving.
	const strongestSetup = setupAdvice.find(advice => advice.changes.length > 0);
	if (strongestSetup) {
		ranked.push({ kind: 'setup', gainS: null, advice: strongestSetup });
	}

	return {
		summary,
		laps,
		sectors,
		isSyntheticSectors: isSynthetic,
		corners,
		pedals,
		findings,
		setupAdvice,
		setupFrames: evidence?.frames ?? 0,
		weatherAdvice: weather ? weatherAdvice(weather) : [],
		improvements: ranked,
		trailBraking,
	};
};
