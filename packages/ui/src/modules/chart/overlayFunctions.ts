import type { TLapRecord, TLapChannel } from '../telemetry/lapTypings';
import type { TTraceLane } from './chartTypings';

/** First grid point of the lap at or after `tMs` into the lap. */
export const indexAtTime = (time: ArrayLike<number>, tMs: number): number => {
	let low = 0;
	let high = time.length - 1;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (time[mid] < tMs) low = mid + 1;
		else high = mid;
	}
	return low;
};

const lapChannelOf = (record: TLapRecord, channel: string): Float32Array | null =>
	(record.channels as Partial<Record<string, Float32Array>>)[channel as TLapChannel] ?? null;

/**
 * The trace chart's data for a moment of a recorded lap: the last `windowSeconds` before
 * `tMs`, time relative to that moment, the same shape the live chart draws.
 */
export const buildLapWindowData = (
	lanes: TTraceLane[],
	record: TLapRecord,
	tMs: number,
	windowSeconds: number,
): {
	xAxis: { min: number; max: number }[];
	series: { id: string; data: [number, number][] }[];
} => {
	const time = record.channels.timeMs;
	const first = indexAtTime(time, tMs - windowSeconds * 1000);
	const last = Math.min(time.length - 1, indexAtTime(time, tMs));
	return {
		xAxis: lanes.map(() => ({ min: -windowSeconds, max: 0 })),
		series: lanes.flatMap(lane =>
			lane.series.map(series => {
				const values = lapChannelOf(record, series.channel);
				const data: [number, number][] = [];
				if (values) {
					for (let i = first; i <= last; i += 1) {
						data.push([(time[i] - tMs) / 1000, values[i]]);
					}
				}
				return { id: `${lane.id}.${series.channel}`, data };
			}),
		),
	};
};

/** Value of a lap channel at `tMs` into the lap (the grid point just after it). */
export const lapValueAt = (record: TLapRecord, channel: TLapChannel, tMs: number): number =>
	record.channels[channel][
		Math.min(record.channels.timeMs.length - 1, indexAtTime(record.channels.timeMs, tMs))
	] ?? 0;
