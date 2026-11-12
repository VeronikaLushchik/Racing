import { TLapSummary, TTelemetryFrame, TWheelTuple } from '@racing/shared';

import {
	buildDistanceGrid,
	lapDistanceScale,
	resampleByDistance,
} from '~@engines/racingMath/distanceResampling';

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
		this.raw.rpm.push(frame.rpm);
		this.raw.gLat.push(frame.gLat);
		this.raw.x.push(frame.x);
		this.raw.z.push(frame.z);
	}

	/**
	 * Resamples the lap onto the distance grid. With `trackLength` the lap is first stretched to
	 * exactly that length, so laps with integrated distance (GT7) line up to the end.
	 */
	finish(summary: TLapSummary, trackLength: number | null = null): TLapRecord | null {
		// Partial laps (the page opened mid-lap) would line up wrongly with full ones.
		if (this.distance.length < 10 || this.distance[0] > MAX_START_GAP_M) {
			return null;
		}
		const last = this.distance.length - 1;
		const scale = lapDistanceScale(
			{
				lastDistance: this.distance[last],
				lastTimeMs: this.raw.timeMs[last],
				lastSpeedKmh: this.raw.speed[last],
				lapTimeMs: summary.lapTimeMs,
			},
			trackLength,
		);
		const distance = scale === 1 ? this.distance : this.distance.map(d => d * scale);
		const grid = buildDistanceGrid(
			scale === 1 || !trackLength ? distance[last] : trackLength,
			LAP_GRID_STEP_M,
		);
		const channels = LAP_CHANNELS.reduce(
			(acc, channel) => ({
				...acc,
				[channel]: resampleByDistance(distance, this.raw[channel], grid),
			}),
			{} as Record<TLapChannel, Float32Array>,
		);
		this.extrapolateStartTime(distance, grid, channels.timeMs);
		this.extrapolateEndTime(distance, grid, channels.timeMs);
		const tyreTempAvg = this.tyreTempSum
			? (this.tyreTempSum.map(sum => sum / this.tyreTempCount) as TWheelTuple<number>)
			: null;

		return {
			...summary,
			step: LAP_GRID_STEP_M,
			distanceScale: scale,
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
	private extrapolateStartTime(
		distance: number[],
		grid: Float32Array,
		timeMs: Float32Array,
	): void {
		const firstDistance = distance[0];
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

	/** Same at the line: grid points after the last sample would otherwise copy its time. */
	private extrapolateEndTime(distance: number[], grid: Float32Array, timeMs: Float32Array): void {
		const last = distance.length - 1;
		const lastDistance = distance[last];
		const speedMs = this.raw.speed[last] / 3.6;
		if (speedMs <= 0) {
			return;
		}
		for (let i = grid.length - 1; i >= 0 && grid[i] > lastDistance; i -= 1) {
			timeMs[i] = this.raw.timeMs[last] + ((grid[i] - lastDistance) / speedMs) * 1000;
		}
	}
}
