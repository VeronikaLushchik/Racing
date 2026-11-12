import type { TLapRecord } from '../../modules/telemetry/lapTypings';

/*
 * A lap only counts when it really went round the track. Games send lap changes that are not
 * laps: a restart, a return to the pits, a session that starts on the line, a lap counter that
 * jumps. Such "laps" last a few seconds and cover a few hundred metres; counted as valid they
 * become the best lap and every real lap looks slow next to them.
 */

/** No circuit is lapped faster than this, ms (the shortest ovals take about 20 s). */
export const MIN_LAP_MS = 20000;
/** No circuit is shorter than this, m. */
export const MIN_LAP_M = 400;
/** Share of the track length a lap must cover to count. */
export const FULL_LAP_SHARE = 0.9;

/** Distance the lap record covers, m. */
export const lapCoverageM = (record: Pick<TLapRecord, 'distance'>): number =>
	record.distance.length ? record.distance[record.distance.length - 1] : 0;

const median = (values: number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/** Length a full lap has: the track length, else the typical distance of the long laps. */
export const referenceLapLength = (
	records: Pick<TLapRecord, 'distance' | 'lapTimeMs'>[],
	trackLength: number | null,
): number | null => {
	if (trackLength && trackLength > 0) return trackLength;
	return median(
		records
			.filter(record => record.lapTimeMs >= MIN_LAP_MS)
			.map(lapCoverageM)
			.filter(distance => distance >= MIN_LAP_M),
	);
};

/** Average speed above the top speed means the car was moved (reset, teleport, rewind). */
const TELEPORT_MARGIN = 1.05;

export const isPlausibleLap = (
	lapTimeMs: number,
	coveredM: number | null,
	referenceLength: number | null,
	topSpeedKmh: number | null = null,
): boolean => {
	if (lapTimeMs < MIN_LAP_MS) return false;
	if (coveredM === null) return true;
	if (coveredM < MIN_LAP_M) return false;
	if (topSpeedKmh !== null && topSpeedKmh > 0) {
		const avgKmh = (coveredM / (lapTimeMs / 1000)) * 3.6;
		if (avgKmh > topSpeedKmh * TELEPORT_MARGIN) return false;
	}
	return !referenceLength || coveredM >= referenceLength * FULL_LAP_SHARE;
};

const topSpeedOf = (record: Pick<TLapRecord, 'channels'>): number => {
	let top = 0;
	record.channels.speed.forEach(speed => {
		top = Math.max(top, speed);
	});
	return top;
};

/** Whether the record is a real lap of the track. */
export const isPlausibleRecord = (record: TLapRecord, referenceLength: number | null): boolean =>
	isPlausibleLap(record.lapTimeMs, lapCoverageM(record), referenceLength, topSpeedOf(record));

/**
 * Only the records that went round the track. The rest are not laps at all, so they are left
 * out instead of being kept as invalid laps with nonsense numbers.
 */
export const withLapQuality = <T extends TLapRecord>(
	records: T[],
	trackLength: number | null,
): T[] => {
	const reference = referenceLapLength(records, trackLength);
	return records.filter(record => isPlausibleRecord(record, reference));
};
