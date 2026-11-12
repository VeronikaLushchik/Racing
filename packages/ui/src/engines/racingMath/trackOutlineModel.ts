/** A track drawn from one clean lap, saved so later sessions can be placed on it. */
export interface TTrackOutline {
	id: string;
	name: string;
	/** Lap length, m. */
	length: number;
	x: number[];
	z: number[];
	/** Lap time of the lap the outline was drawn from, ms; a faster lap replaces it. */
	lapTimeMs: number;
	savedAt: number;
}

export interface TTrackPoint {
	x: number;
	z: number;
}

export interface TAlignedPoint extends TTrackPoint {
	/** `coordinates`: the car's own X/Z lie on the outline. `distance`: placed by lap distance. */
	mode: 'coordinates' | 'distance';
}

export const OUTLINE_STEP_M = 4;
/** The car counts as on the outline when it is this close to it, m. */
export const ALIGN_TOLERANCE_M = 40;
const MATCH_TOLERANCE_M = 15;
const MATCH_LENGTH_RATIO = 0.03;
const MATCH_SAMPLES = 24;

const round = (value: number): number => Math.round(value * 10) / 10;

/** Outline of a lap resampled every `OUTLINE_STEP_M`, from channels on a `step` m grid. */
export const buildOutline = (
	lap: { step: number; x: ArrayLike<number>; z: ArrayLike<number>; lapTimeMs: number },
	meta: { id: string; name: string; savedAt: number },
): TTrackOutline => {
	const stride = Math.max(1, Math.round(OUTLINE_STEP_M / lap.step));
	const x: number[] = [];
	const z: number[] = [];
	for (let i = 0; i < lap.x.length; i += stride) {
		x.push(round(lap.x[i]));
		z.push(round(lap.z[i]));
	}
	return {
		...meta,
		length: (lap.x.length - 1) * lap.step,
		x,
		z,
		lapTimeMs: lap.lapTimeMs,
	};
};

/** Closest outline point to (x, z) and how far it is, m. */
export const nearestPoint = (
	outline: Pick<TTrackOutline, 'x' | 'z'>,
	x: number,
	z: number,
): { index: number; distanceM: number } => {
	let index = -1;
	let best = Infinity;
	for (let i = 0; i < outline.x.length; i += 1) {
		const d = (outline.x[i] - x) ** 2 + (outline.z[i] - z) ** 2;
		if (d < best) {
			best = d;
			index = i;
		}
	}
	return { index, distanceM: Math.sqrt(best) };
};

/** Point at a lap distance, scaled to the outline's own length (wraps around the line). */
export const pointAtDistance = (
	outline: Pick<TTrackOutline, 'x' | 'z' | 'length'>,
	lapDistance: number,
	sourceLength = outline.length,
): TTrackPoint => {
	const count = outline.x.length;
	const fraction = sourceLength > 0 ? lapDistance / sourceLength : 0;
	const wrapped = ((fraction % 1) + 1) % 1;
	const index = Math.min(count - 1, Math.round(wrapped * (count - 1)));
	return { x: outline.x[index], z: outline.z[index] };
};

/**
 * Where to draw a car on the chosen outline. When its own coordinates lie on the outline (same
 * track, same coordinate system) they are used as they are; otherwise the car is placed by how
 * far round the lap it is, which still works for another source or a mis-picked track.
 */
export const alignToOutline = (
	outline: Pick<TTrackOutline, 'x' | 'z' | 'length'>,
	sample: { x: number; z: number; lapDistance: number },
	sourceLength?: number | null,
): TAlignedPoint => {
	if (Number.isFinite(sample.x) && Number.isFinite(sample.z)) {
		const nearest = nearestPoint(outline, sample.x, sample.z);
		if (nearest.distanceM <= ALIGN_TOLERANCE_M) {
			return { x: sample.x, z: sample.z, mode: 'coordinates' };
		}
	}
	return {
		...pointAtDistance(outline, sample.lapDistance, sourceLength ?? outline.length),
		mode: 'distance',
	};
};

/** Same track: similar length and points of `b` lying on `a`. */
export const outlinesMatch = (
	a: Pick<TTrackOutline, 'x' | 'z' | 'length'>,
	b: Pick<TTrackOutline, 'x' | 'z' | 'length'>,
): boolean => {
	if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * MATCH_LENGTH_RATIO) {
		return false;
	}
	const step = Math.max(1, Math.floor(b.x.length / MATCH_SAMPLES));
	const distances: number[] = [];
	for (let i = 0; i < b.x.length; i += step) {
		distances.push(nearestPoint(a, b.x[i], b.z[i]).distanceM);
	}
	distances.sort((p, q) => p - q);
	return distances[Math.floor(distances.length / 2)] <= MATCH_TOLERANCE_M;
};

/**
 * The saved outline the car is driving on, judged by its recent path rather than one point:
 * a single point can land near any track drawn in another game's coordinates. Every point
 * must lie on the outline; when several fit, the closest wins.
 */
export const findOutlineAt = <T extends TTrackOutline>(
	outlines: T[],
	trail: TTrackPoint[],
): T | null => {
	const points = trail.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z));
	if (points.length === 0) {
		return null;
	}
	let best: T | null = null;
	let bestScore = Infinity;
	outlines.forEach(outline => {
		let worst = 0;
		let total = 0;
		for (const point of points) {
			const { distanceM } = nearestPoint(outline, point.x, point.z);
			worst = Math.max(worst, distanceM);
			total += distanceM;
			if (worst > ALIGN_TOLERANCE_M) {
				return;
			}
		}
		const score = total / points.length;
		if (score < bestScore) {
			best = outline;
			bestScore = score;
		}
	});
	return best;
};

/** Library id of a track by its name, so the same track from a game is saved once. */
export const trackIdOf = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/**
 * Adds `outline` to the library: it replaces a saved outline of the same track when it was
 * drawn from a faster lap (keeping that one's name), and is ignored when slower.
 */
export const mergeOutline = (library: TTrackOutline[], outline: TTrackOutline): TTrackOutline[] => {
	const index = library.findIndex(
		saved => saved.id === outline.id || outlinesMatch(saved, outline),
	);
	if (index === -1) {
		return [...library, outline];
	}
	const saved = library[index];
	if (saved.lapTimeMs <= outline.lapTimeMs) {
		return library;
	}
	const next = [...library];
	next[index] = { ...outline, id: saved.id, name: saved.name };
	return next;
};
