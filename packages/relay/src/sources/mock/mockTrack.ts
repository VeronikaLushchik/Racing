const G = 9.81;
export const TOP_SPEED_MS = 84; // ~300 km/h

export interface TMockTrack {
	length: number;
	/** One entry per metre. */
	x: Float32Array;
	z: Float32Array;
	/** Signed curvature, 1/m (positive = left turn). */
	curvature: Float32Array;
	/** Speed per metre of a perfect lap on fresh tyres and an empty tank, m/s. */
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

/* ----------------------------------------------------------------------------------------- */
/* Car physics: a GT3 car, point mass with a friction circle, aero and a power curve          */
/* ----------------------------------------------------------------------------------------- */

/** Tyre friction coefficient of fresh, warm slicks at low speed. */
export const BASE_MU = 1.5;
/** Downforce: grip grows by this × v² (m/s), about +40% at 270 km/h. */
const AERO_GRIP = 0.00007;
/** Engine power over mass, W/kg (about 500 hp in a 1300 kg car with driver). */
const POWER_TO_MASS = 290;
/** Share of the weight on the driven (rear) wheels when pulling out of a corner. */
const TRACTION_SHARE = 0.62;

export interface TCarLimits {
	/** Friction coefficient for this lap: compound, tyre temperature and wear included. */
	mu: number;
	/** 1 with an empty tank, smaller with fuel on board. */
	massFactor: number;
}

export const FRESH_CAR: TCarLimits = { mu: BASE_MU, massFactor: 1 };

/** Aerodynamic drag plus rolling resistance, m/s². */
export const dragAccel = (v: number): number => 0.15 + 0.00052 * v * v;

/** What the engine can push at full throttle, m/s² (traction aside). */
export const engineAccel = (v: number, car: TCarLimits): number =>
	(POWER_TO_MASS / Math.max(v, 4)) * car.massFactor;

/** Grip available at speed v, in m/s² (the radius of the friction circle). */
export const gripAccel = (v: number, car: TCarLimits): number =>
	car.mu * G * (1 + AERO_GRIP * v * v);

/** Brake force the tyres can carry at speed v with no cornering, m/s² (without drag). */
export const brakeCapacity = (v: number, car: TCarLimits): number =>
	gripAccel(v, car) * (0.5 + 0.5 * car.massFactor);

/** Fastest speed through a curvature k (1/m) at the grip of this lap, m/s. */
export const cornerSpeed = (k: number, car: TCarLimits, factor = 1): number => {
	const mu = car.mu * factor;
	const denominator = Math.abs(k) - mu * G * AERO_GRIP;
	if (denominator <= 0) return TOP_SPEED_MS;
	return Math.min(TOP_SPEED_MS, Math.sqrt((mu * G) / denominator));
};

/** Share of the friction circle the corner leaves for braking or pulling, 0..1. */
const longitudinalShare = (v: number, k: number, car: TCarLimits, factor: number): number => {
	const lateral = (v * v * Math.abs(k)) / (gripAccel(v, car) * factor);
	return Math.sqrt(Math.max(0, 1 - lateral * lateral));
};

export interface TProfileShape {
	/** Per metre: multiplier of the cornering grip the driver uses (1 = on the limit). */
	cornerFactor?: Float32Array;
	/** Per metre: multiplier of the braking the driver uses (below 1 = brakes early). */
	brakeFactor?: Float32Array;
}

/**
 * Speed per metre for one lap: the corner limit, then a forward pass for acceleration (engine,
 * traction and what the corner leaves of the friction circle) and a backward pass for braking.
 * The friction circle makes the driver trail the brakes into the apex and squeeze the throttle
 * on the way out, like a real lap.
 */
export const buildSpeedProfile = (
	curvature: Float32Array,
	car: TCarLimits,
	shape: TProfileShape = {},
): Float32Array => {
	const n = curvature.length;
	const corner = (i: number): number => shape.cornerFactor?.[i] ?? 1;
	const braking = (i: number): number => shape.brakeFactor?.[i] ?? 1;
	const speed = new Float32Array(n);
	for (let i = 0; i < n; i += 1) speed[i] = cornerSpeed(curvature[i], car, corner(i));
	for (let pass = 0; pass < 2; pass += 1) {
		for (let i = 0; i < n; i += 1) {
			const prev = speed[(i - 1 + n) % n];
			const share = Math.max(0.08, longitudinalShare(prev, curvature[i], car, corner(i)));
			const traction = gripAccel(prev, car) * TRACTION_SHARE * share;
			const accel = Math.min(engineAccel(prev, car), traction) - dragAccel(prev);
			speed[i] = Math.min(speed[i], Math.sqrt(Math.max(0, prev * prev + 2 * accel)));
		}
		for (let i = n - 1; i >= 0; i -= 1) {
			const next = speed[(i + 1) % n];
			const share = Math.max(0.08, longitudinalShare(next, curvature[i], car, corner(i)));
			const decel = brakeCapacity(next, car) * braking(i) * share + dragAccel(next);
			speed[i] = Math.min(speed[i], Math.sqrt(next * next + 2 * decel));
		}
	}
	return speed;
};

export interface TCorner {
	/** Number on the track map, from 1. */
	index: number;
	/** First and last metre of the corner, and its tightest point. */
	start: number;
	end: number;
	apex: number;
	/** 1 = left-hander, -1 = right-hander. */
	direction: 1 | -1;
}

/** Corner threshold, 1/m (a radius under ~280 m). */
const CORNER_K = 0.0036;

/** Corners of the circuit: runs of curvature above the threshold, tiny gaps merged. */
export const findCorners = (curvature: Float32Array): TCorner[] => {
	const n = curvature.length;
	// Start the scan on a straight so no corner is cut in two by the wrap.
	let origin = 0;
	while (origin < n && Math.abs(curvature[origin]) >= CORNER_K) origin += 1;
	const corners: TCorner[] = [];
	let current: { start: number; end: number; apex: number; peak: number; sign: number } | null =
		null;
	for (let step = 0; step < n; step += 1) {
		const i = (origin + step) % n;
		const k = curvature[i];
		const isCorner = Math.abs(k) >= CORNER_K;
		if (isCorner && current && Math.sign(k) === current.sign && step - current.end < 40) {
			current.end = step;
			if (Math.abs(k) > current.peak) {
				current.peak = Math.abs(k);
				current.apex = step;
			}
		} else if (isCorner) {
			if (current) corners.push(toCorner(current, origin, n, corners.length));
			current = { start: step, end: step, apex: step, peak: Math.abs(k), sign: Math.sign(k) };
		}
	}
	if (current) corners.push(toCorner(current, origin, n, corners.length));
	return corners
		.sort((a, b) => a.start - b.start)
		.map((corner, i) => ({ ...corner, index: i + 1 }));
};

const toCorner = (
	run: { start: number; end: number; apex: number; sign: number },
	origin: number,
	n: number,
	index: number,
): TCorner => ({
	index: index + 1,
	start: (run.start + origin) % n,
	end: (run.end + origin) % n,
	apex: (run.apex + origin) % n,
	direction: run.sign > 0 ? 1 : -1,
});

export const buildMockTrack = (): TMockTrack => {
	const dense = sampleSpline(CONTROL_POINTS, 200);
	const { x, z } = resampleByDistance(dense);
	const curvature = computeCurvature(x, z, 6);
	return {
		length: x.length,
		x: Float32Array.from(x),
		z: Float32Array.from(z),
		curvature,
		speed: buildSpeedProfile(curvature, FRESH_CAR),
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
