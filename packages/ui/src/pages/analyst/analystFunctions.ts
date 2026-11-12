import type { TLapRecord } from '../../modules/telemetry/lapTypings';
import { OUTLIER_RATIO } from '../../engines/racingMath/sessionReportModel';

/** Heat level of the time lost in a corner: 0 fastest of the session … 4 a big loss. */
export const lossLevel = (lossS: number): number => {
	if (lossS < 0.005) return 0;
	if (lossS < 0.1) return 1;
	if (lossS < 0.25) return 2;
	if (lossS < 0.5) return 3;
	return 4;
};

/** The best valid lap and the clean laps beside it (valid, not pit, within 107% of the best). */
export const cleanLaps = (
	records: TLapRecord[],
): { best: TLapRecord | null; clean: TLapRecord[] } => {
	const valid = records.filter(record => record.isValid && !record.isPitLap);
	if (valid.length === 0) return { best: null, clean: [] };
	const best = valid.reduce((a, b) => (b.lapTimeMs < a.lapTimeMs ? b : a));
	return {
		best,
		clean: valid.filter(record => record.lapTimeMs <= best.lapTimeMs * OUTLIER_RATIO),
	};
};
