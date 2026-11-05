/** Grid of distances 0, step, 2·step … up to `maxDistance` (inclusive when it lands on the grid). */
export const buildDistanceGrid = (maxDistance: number, step: number): Float32Array => {
	const count = Math.max(0, Math.floor(maxDistance / step) + 1);
	const grid = new Float32Array(count);
	for (let i = 0; i < count; i += 1) {
		grid[i] = i * step;
	}
	return grid;
};

/**
 * Resamples `values` measured at strictly increasing `distance` onto `grid` by linear
 * interpolation. Grid points before the first sample take the first value, after the last the
 * last value, so laps that start a few metres after the line still line up.
 */
export const resampleByDistance = (
	distance: ArrayLike<number>,
	values: ArrayLike<number>,
	grid: ArrayLike<number>,
): Float32Array => {
	const result = new Float32Array(grid.length);
	if (distance.length === 0) {
		return result;
	}
	let j = 0;
	for (let i = 0; i < grid.length; i += 1) {
		const s = grid[i];
		while (j < distance.length - 2 && distance[j + 1] < s) {
			j += 1;
		}
		if (s <= distance[0]) {
			result[i] = values[0];
		} else if (s >= distance[distance.length - 1]) {
			result[i] = values[values.length - 1];
		} else {
			const span = distance[j + 1] - distance[j];
			const k = span > 0 ? (s - distance[j]) / span : 0;
			result[i] = values[j] + (values[j + 1] - values[j]) * k;
		}
	}
	return result;
};

/** Value of a resampled channel at an arbitrary distance (linear between grid points). */
export const valueAtDistance = (channel: ArrayLike<number>, step: number, s: number): number => {
	if (channel.length === 0) {
		return Number.NaN;
	}
	const position = Math.min(Math.max(s / step, 0), channel.length - 1);
	const i = Math.floor(position);
	const k = position - i;
	return i + 1 < channel.length ? channel[i] + (channel[i + 1] - channel[i]) * k : channel[i];
};

/** Largest correction applied to a lap's length; bigger gaps mean a cut, a reset or bad data. */
export const MAX_LAP_LENGTH_ERROR = 0.05;

export interface TLapEnd {
	/** Distance of the last sample of the lap, m. */
	lastDistance: number;
	/** Lap time of the last sample, ms. */
	lastTimeMs: number;
	/** Speed of the last sample, km/h. */
	lastSpeedKmh: number;
	/** Official lap time, ms. */
	lapTimeMs: number;
}

/**
 * Factor that stretches a lap's measured distance to the track length. Sources like GT7 have no
 * lap distance and integrate speed instead, so every lap comes out a few metres longer or shorter
 * and two laps drift apart towards the line. The last sample arrives just before the line, so
 * the missing tail is added at the last speed first. Returns 1 when the length is unknown or the
 * lap is too far off to trust.
 */
export const lapDistanceScale = (end: TLapEnd, trackLength: number | null): number => {
	if (!trackLength || trackLength <= 0 || end.lastDistance <= 0) {
		return 1;
	}
	const tailMs = Math.max(0, end.lapTimeMs - end.lastTimeMs);
	const measured = end.lastDistance + (end.lastSpeedKmh / 3.6) * (tailMs / 1000);
	const scale = trackLength / measured;
	return Math.abs(scale - 1) <= MAX_LAP_LENGTH_ERROR ? scale : 1;
};
