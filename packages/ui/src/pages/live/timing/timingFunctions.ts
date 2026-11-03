/** @format */

import { TLapSummary } from '@racing/shared';

export type TSplitState = 'purple' | 'green' | 'yellow';

export interface TClassifiedLap {
	lap: TLapSummary;
	lapState: TSplitState | null;
	sectorStates: (TSplitState | null)[];
}

const classify = (value: number, bestOverall: number, bestBefore: number | null): TSplitState => {
	if (value <= bestOverall) return 'purple';
	if (bestBefore === null || value < bestBefore) return 'green';
	return 'yellow';
};

/**
 * Colours laps and sectors the way timing screens do:
 * purple = best of the session, green = a personal best at the moment it was set, yellow = slower.
 * Invalid and pit laps are not classified and do not count as references.
 */
export const classifyLaps = (laps: TLapSummary[]): TClassifiedLap[] => {
	const counted = laps.filter(l => l.isValid && !l.isPitLap);
	const sectorCount = Math.max(0, ...counted.map(l => l.sectorsMs.length));
	const bestLap = counted.length ? Math.min(...counted.map(l => l.lapTimeMs)) : null;
	const bestSectors = Array.from({ length: sectorCount }, (_, i) => {
		const values = counted
			.map(l => l.sectorsMs[i])
			.filter((v): v is number => typeof v === 'number');
		return values.length ? Math.min(...values) : null;
	});

	let runningBestLap: number | null = null;
	const runningBestSectors: (number | null)[] = bestSectors.map(() => null);

	return [...laps]
		.sort((a, b) => a.lap - b.lap)
		.map(lap => {
			if (!lap.isValid || lap.isPitLap || bestLap === null) {
				return { lap, lapState: null, sectorStates: lap.sectorsMs.map(() => null) };
			}
			const lapState = classify(lap.lapTimeMs, bestLap, runningBestLap);
			runningBestLap =
				runningBestLap === null ? lap.lapTimeMs : Math.min(runningBestLap, lap.lapTimeMs);
			const sectorStates = lap.sectorsMs.map((value, i) => {
				const best = bestSectors[i];
				if (best === null || best === undefined) return null;
				const state = classify(value, best, runningBestSectors[i]);
				const previous = runningBestSectors[i];
				runningBestSectors[i] = previous === null ? value : Math.min(previous, value);
				return state;
			});
			return { lap, lapState, sectorStates };
		});
};

export const formatSector = (ms: number | undefined): string =>
	ms === undefined ? '—' : (ms / 1000).toFixed(3);

export const formatGap = (seconds: number | null): string =>
	seconds === null ? '—' : `+${seconds.toFixed(seconds < 10 ? 3 : 1)}`;
