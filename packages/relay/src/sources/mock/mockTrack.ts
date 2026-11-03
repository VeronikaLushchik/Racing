/** @format */

const G = 9.81;
const TOP_SPEED_MS = 82; // ~295 km/h
const MAX_LAT_G = 1.7;
const BASE_BRAKE_G = 1.5;

export interface TMockTrack {
	length: number;
	/** One entry per metre. */
	x: Float32Array;
	z: Float32Array;
	/** Signed curvature, 1/m (positive = left turn). */
	curvature: Float32Array;
	/** Ideal speed per metre, m/s. */
	speed: Float32Array;
}

/** Hand-placed control points of a fictional ~4.5 km circuit, metres. */
const CONTROL_POINTS: [number, number][] = [
	[0, 0],
	[900, 0],
	[1050, 80],
	[1080, 260],
	[900, 380],
	[760, 340],
	[640, 460],
	[700, 640],
	[520, 760],
	[260, 700],
	[180, 520],
	[-120, 560],
	[-260, 420],
	[-200, 200],
	[-120, 60],
];

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
};

const sampleSpline = (points: [number, number][], stepsPerSegment: number): [number, number][] => {
	const out: [number, number][] = [];
	const n = points.length;
	for (let i = 0; i < n; i += 1) {
		const p0 = points[(i - 1 + n) % n];
		const p1 = points[i];
		const p2 = points[(i + 1) % n];
		const p3 = points[(i + 2) % n];
		for (let s = 0; s < stepsPerSegment; s += 1) {
			const t = s / stepsPerSegment;
			out.push([
				catmullRom(p0[0], p1[0], p2[0], p3[0], t),
				catmullRom(p0[1], p1[1], p2[1], p3[1], t),
			]);
		}
	}
	return out;
};

/** Resamples a closed polyline to points exactly 1 m apart. */
const resampleByDistance = (dense: [number, number][]): { x: number[]; z: number[] } => {
	const x: number[] = [];
	const z: number[] = [];
	let carry = 0;
	for (let i = 0; i < dense.length; i += 1) {
		const [ax, az] = dense[i];
		const [bx, bz] = dense[(i + 1) % dense.length];
		const segment = Math.hypot(bx - ax, bz - az);
		let d = carry;
		while (d < segment) {
			const t = d / segment;
			x.push(ax + (bx - ax) * t);
			z.push(az + (bz - az) * t);
			d += 1;
		}
		carry = d - segment;
	}
	return { x, z };
};

const computeCurvature = (x: number[], z: number[], window: number): Float32Array => {
	const n = x.length;
	const curvature = new Float32Array(n);
	for (let i = 0; i < n; i += 1) {
		const a = (i - window + n) % n;
		const c = (i + window) % n;
		const h1 = Math.atan2(z[i] - z[a], x[i] - x[a]);
		const h2 = Math.atan2(z[c] - z[i], x[c] - x[i]);
		let dh = h2 - h1;
		while (dh > Math.PI) dh -= 2 * Math.PI;
		while (dh < -Math.PI) dh += 2 * Math.PI;
		curvature[i] = dh / window;
	}
	return curvature;
};

const accelLimit = (v: number): number => Math.max(1.2, 8.5 * (1 - v / TOP_SPEED_MS));
const brakeLimit = (v: number): number => BASE_BRAKE_G * G + 0.0009 * v * v;

const computeSpeedProfile = (curvature: Float32Array): Float32Array => {
	const n = curvature.length;
	const speed = new Float32Array(n);
	for (let i = 0; i < n; i += 1) {
		const k = Math.abs(curvature[i]);
		speed[i] = k > 1e-5 ? Math.min(TOP_SPEED_MS, Math.sqrt((MAX_LAT_G * G) / k)) : TOP_SPEED_MS;
	}
	// Two passes around the closed loop so the start/finish wraps correctly.
	for (let pass = 0; pass < 2; pass += 1) {
		for (let i = 0; i < n; i += 1) {
			const prev = speed[(i - 1 + n) % n];
			speed[i] = Math.min(speed[i], Math.sqrt(prev * prev + 2 * accelLimit(prev)));
		}
		for (let i = n - 1; i >= 0; i -= 1) {
			const next = speed[(i + 1) % n];
			speed[i] = Math.min(speed[i], Math.sqrt(next * next + 2 * brakeLimit(next)));
		}
	}
	return speed;
};

export const buildMockTrack = (): TMockTrack => {
	const dense = sampleSpline(CONTROL_POINTS, 200);
	const { x, z } = resampleByDistance(dense);
	const curvature = computeCurvature(x, z, 6);
	return {
		length: x.length,
		x: Float32Array.from(x),
		z: Float32Array.from(z),
		curvature,
		speed: computeSpeedProfile(curvature),
	};
};

/** Linear interpolation of a per-metre array at a fractional distance. */
export const sampleAt = (values: Float32Array, distance: number): number => {
	const n = values.length;
	const d = ((distance % n) + n) % n;
	const i = Math.floor(d);
	const t = d - i;
	return values[i] * (1 - t) + values[(i + 1) % n] * t;
};

export const estimateLapTimeS = (track: TMockTrack): number => {
	let total = 0;
	for (let i = 0; i < track.length; i += 1) total += 1 / track.speed[i];
	return total;
};
