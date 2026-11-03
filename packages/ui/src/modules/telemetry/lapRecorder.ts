import { TLapSummary, TTelemetryFrame, TWheelTuple } from '@racing/shared';

import { buildDistanceGrid, resampleByDistance } from '~@engines/racingMath/distanceResampling';

import { LAP_CHANNELS, TLapChannel, TLapRecord } from './lapTypings';

export const LAP_GRID_STEP_M = 2;
const MIN_SAMPLE_GAP_M = 0.25;
/** A lap whose first sample is further than this from the line was joined mid-lap, m. */
const MAX_START_GAP_M = 50;

/** Collects the frames of one lap and turns them into a `TLapRecord` when the lap ends. */
export class LapRecorder {
	private readonly distance: number[] = [];
	private readonly raw: Record<TLapChannel, number[]> = LAP_CHANNELS.reduce(
		(acc, channel) => ({ ...acc, [channel]: [] }),
		{} as Record<TLapChannel, number[]>,
	);
	private tyreTempSum: number[] | null = null;
	private tyreTempCount = 0;
	private tyreWearEnd: TWheelTuple<number> | null = null;
	private fuelStart: number | null = null;
	private fuelEnd: number | null = null;

	constructor(readonly lap: number) {}

	get sampleCount(): number {
		return this.distance.length;
	}

	push(frame: TTelemetryFrame): void {
		if (this.fuelStart === null) {
			this.fuelStart = frame.fuel;
		}
		this.fuelEnd = frame.fuel;
		this.tyreWearEnd = frame.tyreWear;
		if (frame.tyreTemps) {
			this.tyreTempSum ??= [0, 0, 0, 0];
			frame.tyreTemps.forEach((value, i) => {
				(this.tyreTempSum as number[])[i] += value;
			});
			this.tyreTempCount += 1;
		}

		const last = this.distance[this.distance.length - 1];
		// Distance must grow strictly so the lap can be resampled.
		if (last !== undefined && frame.lapDistance < last + MIN_SAMPLE_GAP_M) {
			return;
		}
		this.distance.push(frame.lapDistance);
		this.raw.timeMs.push(frame.lapTimeMs);
		this.raw.speed.push(frame.speed);
		this.raw.throttle.push(frame.throttle);
		this.raw.brake.push(frame.brake);
		this.raw.gear.push(frame.gear);
		this.raw.gLat.push(frame.gLat);
		this.raw.x.push(frame.x);
		this.raw.z.push(frame.z);
	}

	finish(summary: TLapSummary): TLapRecord | null {
		// Partial laps (the page opened mid-lap) would line up wrongly with full ones.
		if (this.distance.length < 10 || this.distance[0] > MAX_START_GAP_M) {
			return null;
		}
		const grid = buildDistanceGrid(this.distance[this.distance.length - 1], LAP_GRID_STEP_M);
		const channels = LAP_CHANNELS.reduce(
			(acc, channel) => ({
				...acc,
				[channel]: resampleByDistance(this.distance, this.raw[channel], grid),
			}),
			{} as Record<TLapChannel, Float32Array>,
		);
		this.extrapolateStartTime(grid, channels.timeMs);
		const tyreTempAvg = this.tyreTempSum
			? (this.tyreTempSum.map(sum => sum / this.tyreTempCount) as TWheelTuple<number>)
			: null;

		return {
			...summary,
			step: LAP_GRID_STEP_M,
			distance: grid,
			channels,
			tyreTempAvg,
			tyreWearEnd: this.tyreWearEnd,
			fuelStart: this.fuelStart,
			fuelEnd: this.fuelEnd,
		};
	}

	/**
	 * The first frame of a lap arrives a little after the line, so grid points before it would
	 * copy its time. Extrapolating back at the first sample's speed puts 0 m at about 0 ms and
	 * keeps one frame of jitter out of the delta between two laps.
	 */
	private extrapolateStartTime(grid: Float32Array, timeMs: Float32Array): void {
		const firstDistance = this.distance[0];
		const speedMs = this.raw.speed[0] / 3.6;
		if (speedMs <= 0) {
			return;
		}
		for (let i = 0; i < grid.length && grid[i] < firstDistance; i += 1) {
			timeMs[i] = Math.max(
				0,
				this.raw.timeMs[0] - ((firstDistance - grid[i]) / speedMs) * 1000,
			);
		}
	}
}
