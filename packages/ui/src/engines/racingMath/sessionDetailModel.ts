import type { TLapRecord } from '../../modules/telemetry/lapTypings';

import { cornerSegments, findCorners } from './ghostLapModel';
import { pedalShares, TPedalShares } from './sessionReportModel';

/*
 * Lap-by-lap detail for the analyst: what each lap looked like in numbers (speeds, pedal use,
 * gear changes, grip used, fuel and tyres) and how every corner went on every lap. It reads only
 * completed lap records, so it works for every source the same way.
 */

/** Lateral G below this is straight-line noise, not cornering. */
const CORNERING_G = 0.3;

export interface TLapDetail {
	lap: number;
	lapTimeMs: number;
	/** Behind the best valid lap, ms; null when there is no valid lap. */
	deltaToBestMs: number | null;
	isValid: boolean;
	isPitLap: boolean;
	isBest: boolean;
	topSpeedKmh: number;
	minSpeedKmh: number;
	avgSpeedKmh: number;
	pedals: TPedalShares;
	gearChanges: number;
	maxLatG: number;
	/** Mean lateral G while cornering: how much of the grip the lap used. */
	avgCornerG: number;
	/** Litres used in the lap; null without fuel data. */
	fuelUsedL: number | null;
	/** Mean of the four tyres over the lap, °C; null without tyre data. */
	tyreTempC: number | null;
}

export interface TCornerLapCell {
	timeS: number;
	/** Time lost to the fastest version of this corner in the session, s. */
	lossS: number;
	minSpeedKmh: number;
}

export interface TCornerMatrix {
	corners: { number: number; distance: number }[];
	rows: { lap: number; isBest: boolean; cells: TCornerLapCell[]; totalLossS: number }[];
	/** Fastest time of each corner, s. */
	bestS: number[];
}

const timeAt = (record: TLapRecord, index: number): number => {
	const time = record.channels.timeMs;
	return index >= time.length ? record.lapTimeMs : time[index];
};

const bestValid = (records: TLapRecord[]): TLapRecord | null =>
	records
		.filter(record => record.isValid && !record.isPitLap)
		.reduce<TLapRecord | null>(
			(best, record) => (!best || record.lapTimeMs < best.lapTimeMs ? record : best),
			null,
		);

export const lapDetail = (record: TLapRecord, bestMs: number | null): TLapDetail => {
	const { speed, gear, gLat } = record.channels;
	let top = 0;
	let min = Infinity;
	let gearChanges = 0;
	let maxLatG = 0;
	let cornerSum = 0;
	let cornerCount = 0;
	for (let i = 0; i < speed.length; i += 1) {
		top = Math.max(top, speed[i]);
		min = Math.min(min, speed[i]);
		if (i > 0 && gear[i] !== gear[i - 1] && gear[i] > 0 && gear[i - 1] > 0) gearChanges += 1;
		const g = Math.abs(gLat[i]);
		maxLatG = Math.max(maxLatG, g);
		if (g >= CORNERING_G) {
			cornerSum += g;
			cornerCount += 1;
		}
	}
	const lengthM = (speed.length - 1) * record.step;
	const temps = record.tyreTempAvg;
	return {
		lap: record.lap,
		lapTimeMs: record.lapTimeMs,
		deltaToBestMs: bestMs === null ? null : record.lapTimeMs - bestMs,
		isValid: record.isValid,
		isPitLap: record.isPitLap,
		isBest: bestMs !== null && record.lapTimeMs === bestMs && record.isValid,
		topSpeedKmh: top,
		minSpeedKmh: Number.isFinite(min) ? min : 0,
		avgSpeedKmh: record.lapTimeMs > 0 ? (lengthM / (record.lapTimeMs / 1000)) * 3.6 : 0,
		pedals: pedalShares(record),
		gearChanges,
		maxLatG,
		avgCornerG: cornerCount ? cornerSum / cornerCount : 0,
		fuelUsedL:
			record.fuelStart !== null && record.fuelEnd !== null
				? Math.max(0, record.fuelStart - record.fuelEnd)
				: null,
		tyreTempC: temps ? (temps[0] + temps[1] + temps[2] + temps[3]) / 4 : null,
	};
};

/** One row per lap, in lap order. */
export const buildLapDetails = (records: TLapRecord[]): TLapDetail[] => {
	const best = bestValid(records);
	return [...records]
		.sort((a, b) => a.lap - b.lap)
		.map(record => lapDetail(record, best?.lapTimeMs ?? null));
};

/**
 * Time of every valid lap through every corner of the best lap. Corners and their segments come
 * from the best lap, so all laps are cut at the same distances.
 */
export const buildCornerMatrix = (records: TLapRecord[]): TCornerMatrix | null => {
	const best = bestValid(records);
	const laps = records
		.filter(record => record.isValid && !record.isPitLap)
		.sort((a, b) => a.lap - b.lap);
	if (!best || laps.length === 0) {
		return null;
	}
	const length = Math.min(...laps.map(record => record.channels.speed.length));
	const corners = findCorners(best.channels.speed.subarray(0, length), best.step);
	if (corners.length === 0) {
		return null;
	}
	const segments = cornerSegments(corners, length);
	const times = laps.map(record =>
		segments.map(([from, to]) => (timeAt(record, to - 1) - timeAt(record, from)) / 1000),
	);
	const bestS = segments.map((_, c) => Math.min(...times.map(row => row[c])));
	return {
		corners: corners.map(corner => ({ number: corner.number, distance: corner.distance })),
		bestS,
		rows: laps.map((record, r) => {
			const cells = segments.map(([from, to], c) => {
				let minSpeed = Infinity;
				for (let i = from; i < Math.min(to, record.channels.speed.length); i += 1) {
					minSpeed = Math.min(minSpeed, record.channels.speed[i]);
				}
				return {
					timeS: times[r][c],
					lossS: times[r][c] - bestS[c],
					minSpeedKmh: Number.isFinite(minSpeed) ? minSpeed : 0,
				};
			});
			return {
				lap: record.lap,
				isBest: record === best,
				cells,
				totalLossS: cells.reduce((sum, cell) => sum + cell.lossS, 0),
			};
		}),
	};
};
