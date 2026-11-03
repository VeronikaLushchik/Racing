import { TLapRecord } from 'src/modules/telemetry/lapTypings';

const byLapTime = (a: TLapRecord, b: TLapRecord): number => a.lapTimeMs - b.lapTimeMs;

/** Fastest valid lap that is not an in/out lap; any fastest lap when none is clean. */
export const findBestRecord = (records: TLapRecord[]): TLapRecord | null => {
	const clean = records.filter(record => record.isValid && !record.isPitLap).sort(byLapTime);
	return clean[0] ?? [...records].sort(byLapTime)[0] ?? null;
};

/** Reference: the best lap. Compared: the latest lap, or the next best when the latest is best. */
export const pickDefaultLaps = (
	records: TLapRecord[],
): { reference: number | null; compare: number | null } => {
	const best = findBestRecord(records);
	if (!best) {
		return { reference: null, compare: null };
	}
	const latest = records[records.length - 1];
	if (latest.lap !== best.lap) {
		return { reference: best.lap, compare: latest.lap };
	}
	const next = records.filter(record => record.lap !== best.lap).sort(byLapTime)[0];
	return { reference: best.lap, compare: next?.lap ?? null };
};

/** The chosen lap when it still exists, otherwise the fallback. */
export const resolveRecord = (
	records: TLapRecord[],
	chosen: number | null,
	fallback: number | null,
): TLapRecord | null =>
	records.find(record => record.lap === chosen) ??
	records.find(record => record.lap === fallback) ??
	null;
