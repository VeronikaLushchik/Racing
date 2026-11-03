import type { TLapRecord } from '../../modules/telemetry/lapTypings';

export interface TAxisBounds {
	xMin: number;
	xMax: number;
	zMin: number;
	zMax: number;
}

export interface TSectorMark {
	/** Sector that starts here, 2-based (sector 1 starts at the line). */
	sector: number;
	distance: number;
	x: number;
	z: number;
}

/**
 * Axis ranges that keep metres square on screen: the track is centred and the axis with spare
 * room is widened, so a hairpin never looks stretched.
 */
export const squareBounds = (
	x: ArrayLike<number>,
	z: ArrayLike<number>,
	width: number,
	height: number,
	paddingRatio = 0.06,
): TAxisBounds => {
	let xMin = Infinity;
	let xMax = -Infinity;
	let zMin = Infinity;
	let zMax = -Infinity;
	for (let i = 0; i < x.length; i += 1) {
		xMin = Math.min(xMin, x[i]);
		xMax = Math.max(xMax, x[i]);
		zMin = Math.min(zMin, z[i]);
		zMax = Math.max(zMax, z[i]);
	}
	if (!Number.isFinite(xMin) || width <= 0 || height <= 0) {
		return { xMin: -1, xMax: 1, zMin: -1, zMax: 1 };
	}
	const spanX = Math.max(xMax - xMin, 1);
	const spanZ = Math.max(zMax - zMin, 1);
	const metresPerPixel = Math.max(spanX / width, spanZ / height) * (1 + paddingRatio * 2);
	const centreX = (xMin + xMax) / 2;
	const centreZ = (zMin + zMax) / 2;
	const halfX = (metresPerPixel * width) / 2;
	const halfZ = (metresPerPixel * height) / 2;
	return {
		xMin: centreX - halfX,
		xMax: centreX + halfX,
		zMin: centreZ - halfZ,
		zMax: centreZ + halfZ,
	};
};

/** Where each sector after the first begins, found from the lap's sector times. */
export const sectorMarks = (
	lap: Pick<TLapRecord, 'sectorsMs' | 'step' | 'channels'>,
): TSectorMark[] => {
	const { timeMs, x, z } = lap.channels;
	const marks: TSectorMark[] = [];
	let elapsed = 0;
	lap.sectorsMs.slice(0, -1).forEach((sectorMs, n) => {
		elapsed += sectorMs;
		for (let i = 0; i < timeMs.length; i += 1) {
			if (timeMs[i] >= elapsed) {
				marks.push({ sector: n + 2, distance: i * lap.step, x: x[i], z: z[i] });
				return;
			}
		}
	});
	return marks;
};

/**
 * Rate at which `compare` gains or loses time against `reference`, seconds per 100 m, over a
 * centred window. Positive: losing time there. Colours the map by where the time goes.
 */
export const deltaRate = (delta: ArrayLike<number>, step: number, windowM = 40): Float32Array => {
	const radius = Math.max(1, Math.round(windowM / 2 / step));
	const result = new Float32Array(delta.length);
	for (let i = 0; i < delta.length; i += 1) {
		const from = Math.max(0, i - radius);
		const to = Math.min(delta.length - 1, i + radius);
		const span = (to - from) * step;
		result[i] = span > 0 ? ((delta[to] - delta[from]) / span) * 100 : 0;
	}
	return result;
};

/** Symmetric colour range for a diverging channel, ignoring the top 2% as outliers. */
export const symmetricRange = (values: ArrayLike<number>, minimum: number): number => {
	const sorted = Array.from(values, Math.abs).sort((a, b) => a - b);
	if (sorted.length === 0) {
		return minimum;
	}
	const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
	return Math.max(minimum, p98);
};
