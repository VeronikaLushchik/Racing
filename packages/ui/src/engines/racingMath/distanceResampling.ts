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
