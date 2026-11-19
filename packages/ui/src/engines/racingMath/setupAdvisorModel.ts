import type { TTelemetryFrame } from '@racing/shared';

/*
 * Car setup advisor: rules of thumb a race engineer would apply, fed by telemetry.
 *
 * Balance. In a steady corner the steering angle a car needs is δ = L·κ + K·a_y (bicycle
 * model): the geometric part L·κ plus the understeer gradient K times lateral acceleration.
 * The curvature the car actually follows is κ = a_y / v². GT7 gives the steering wheel angle,
 * not the road-wheel angle, and we do not know the steering ratio, so instead of K we compare
 * steer/κ in fast corners with steer/κ in gentle ones, where K·a_y is small. A ratio above 1
 * means the car needs more lock than geometry asks for at grip: understeer. Below 1, or
 * steering against the corner (counter-steer): oversteer. This also cancels any sign
 * convention of the source.
 *
 * Understeer gradient. The same equation also holds sample by sample, so over all steady
 * cornering samples we fit δ = c₁·κ + c₂·a_y (least squares, two unknowns, no intercept).
 * κ and a_y differ by v², so corners at different speeds tell the two terms apart. c₁ is the
 * steering needed per unit of curvature (wheelbase times steering ratio), c₂ the extra
 * steering per G (one c₂ per speed band, see `fitSteering`). With a wheelbase L the road-wheel understeer gradient is K = L·c₂/c₁ rad per
 * G, the textbook number in degrees per G. K > 0 understeer, with characteristic speed
 * v_ch = √(L·g/K): at v_ch the car needs twice the geometric lock. K < 0 oversteer, with
 * critical speed v_cr = √(−L·g/K), above which it is unstable. Fitting c₂ separately for slow
 * and fast corners (c₁ shared) separates mechanical from aerodynamic balance: springs and
 * bars act at every speed, wings grow with v², so a gradient that rises with speed points at
 * the wings.
 *
 * Everything else is direct: wheel speed against car speed for locking and wheelspin, how
 * often the suspension sits at its lowest point at speed for bottoming, front against rear
 * tyre temperature for balance and the tyre window for compound choice.
 */

const G = 9.81;

export type TCornerPhase = 'entry' | 'mid' | 'exit';
export const CORNER_PHASES: TCornerPhase[] = ['entry', 'mid', 'exit'];

/** Lateral G above which a sample counts as cornering hard. */
export const CORNER_G = 0.5;
/** Lateral G band used to learn the neutral steer/curvature ratio. */
const CALIBRATION_G: [number, number] = [0.15, 0.45];
const MIN_CORNER_SPEED_KMH = 40;
const MIN_CALIBRATION_SPEED_KMH = 30;
const MIN_STEER = 0.02;
/** Brake pedal above which a corner sample is "entry". */
const ENTRY_BRAKE = 0.05;
/** Throttle above which a corner sample is "exit". */
const EXIT_THROTTLE = 0.5;
/** Wheel slip ratio beyond which a wheel counts as locking or spinning. */
const SLIP_LIMIT = 0.06;
const MIN_SLIP_SPEED_KMH = 40;
/** Speed above which the suspension is watched for bottoming, km/h. */
const BOTTOMING_SPEED_KMH = 120;
/** Within this of the lowest height seen, the suspension is "on the stops", m. */
const BOTTOMING_BAND_M = 0.0015;
/** Lateral G above which a steady sample enters the understeer gradient fit. */
const GRADIENT_MIN_G = 0.15;
/** Corner speed bands for mechanical against aero balance, km/h. */
export const SLOW_CORNER_KMH = 110;
export const FAST_CORNER_KMH = 160;
/** Fast minus slow gradient that counts as an aero balance problem, ° per G. */
export const AERO_GRADIENT_DEG = 0.5;
/** Wheelbase used when the car profile gives none, m. */
export const DEFAULT_WHEELBASE_M = 2.7;
/** Samples kept per bucket: a few minutes of driving at 60 Hz. */
const BUCKET_SIZE = 6000;

/** Summary is recomputed every this many frames. */
const SUMMARY_EVERY_FRAMES = 30;

/** Minimum samples for each kind of finding. */
export const MIN_SAMPLES = {
	calibration: 120,
	phase: 120,
	braking: 120,
	traction: 120,
	bottoming: 300,
	tyres: 300,
	gradient: 300,
} as const;

/** Thresholds on the balance ratio (1 = neutral). */
export const UNDERSTEER_RATIO = 1.15;
export const OVERSTEER_RATIO = 0.88;
/** Share of corner samples with counter-steer that means the rear is stepping out. */
export const COUNTER_STEER_SHARE = 0.04;
/** Share of braking or traction samples with a locking or spinning wheel worth acting on. */
export const SLIP_SHARE = 0.05;
/** Share of fast samples on the bump stops that means the floor touches. */
export const BOTTOMING_SHARE = 0.05;
/** Front-to-rear tyre temperature gap that shows one axle doing more work, °C. */
export const TYRE_BALANCE_C = 8;

/** Fixed-size buffer of the latest values: medians stay current after a setup change. */
class SampleBucket {
	private readonly values = new Float32Array(BUCKET_SIZE);
	private index = 0;
	count = 0;

	push(value: number): void {
		this.values[this.index] = value;
		this.index = (this.index + 1) % BUCKET_SIZE;
		this.count = Math.min(BUCKET_SIZE, this.count + 1);
	}

	toArray(): number[] {
		return Array.from(this.values.subarray(0, this.count));
	}
}

const median = (values: number[]): number | null => {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export interface TPhaseBalance {
	samples: number;
	/** Median steer/curvature against the neutral one; null without calibration. */
	ratio: number | null;
	/** Share of samples steering against the corner. */
	counterSteerShare: number;
}

export interface TAxleSlip {
	samples: number;
	frontShare: number;
	rearShare: number;
}

export type TSpeedBand = 'slow' | 'medium' | 'fast';
export const SPEED_BANDS: TSpeedBand[] = ['slow', 'medium', 'fast'];

/** Sums for the least squares fit δ = c₁·κ + c₂·a_y. */
export interface TGradientSums {
	samples: number;
	kk: number;
	ka: number;
	aa: number;
	kd: number;
	ad: number;
}

const emptySums = (): TGradientSums => ({ samples: 0, kk: 0, ka: 0, aa: 0, kd: 0, ad: 0 });

export interface TSteerFit {
	samples: number;
	/** Steering per unit curvature. */
	c1: number;
	/** Extra steering per G over all corners. */
	c2: number;
	/** Extra steering per G in slow and fast corners (c₁ shared); null with too few samples. */
	c2Slow: number | null;
	c2Fast: number | null;
	slowSamples: number;
	fastSamples: number;
}

/**
 * Least squares fit of δ = c₁·κ + c₂_b·a_y, one c₂ per speed band and c₁ shared. With
 * the band terms eliminated, c₂_b = (Σaδ_b − c₁·Σκa_b) / Σa²_b and
 * c₁ = (Σκδ − Σ_b Σκa_b·Σaδ_b/Σa²_b) / (Σκ² − Σ_b (Σκa_b)²/Σa²_b).
 * The spread of speeds inside a band pins c₁ down; without it one c₂ is fitted for every corner
 * and the band values are null. Null when the speeds do not vary at all.
 */
export const fitSteering = (bands: Record<TSpeedBand, TGradientSums>): TSteerFit | null => {
	let samples = 0;
	let numerator = 0;
	let denominator = 0;
	let kk = 0;
	SPEED_BANDS.forEach(band => {
		const sums = bands[band];
		samples += sums.samples;
		kk += sums.kk;
		numerator += sums.kd;
		denominator += sums.kk;
		if (sums.aa > 0) {
			numerator -= (sums.ka * sums.ad) / sums.aa;
			denominator -= (sums.ka * sums.ka) / sums.aa;
		}
	});
	if (samples < MIN_SAMPLES.gradient) {
		return null;
	}
	const all = SPEED_BANDS.reduce(
		(acc, band) => ({
			samples: acc.samples + bands[band].samples,
			kk: acc.kk + bands[band].kk,
			ka: acc.ka + bands[band].ka,
			aa: acc.aa + bands[band].aa,
			kd: acc.kd + bands[band].kd,
			ad: acc.ad + bands[band].ad,
		}),
		emptySums(),
	);
	const hasBandSpread = denominator > 1e-6 * kk;
	let c1 = numerator / denominator;
	if (!hasBandSpread) {
		// No speed spread inside the bands: fall back to one c₂ for every corner, which only
		// needs different speeds across the whole session.
		const det = all.kk * all.aa - all.ka * all.ka;
		if (det <= 1e-6 * all.kk * all.aa) {
			return null;
		}
		c1 = (all.kd * all.aa - all.ad * all.ka) / det;
	}
	if (!Number.isFinite(c1) || Math.abs(c1) < 1e-9) {
		return null;
	}
	const bandC2 = (sums: TGradientSums, minSamples: number): number | null =>
		hasBandSpread && sums.samples >= minSamples && sums.aa > 0
			? (sums.ad - c1 * sums.ka) / sums.aa
			: null;
	return {
		samples,
		c1,
		c2: all.aa > 0 ? (all.ad - c1 * all.ka) / all.aa : 0,
		c2Slow: bandC2(bands.slow, MIN_SAMPLES.gradient),
		c2Fast: bandC2(bands.fast, MIN_SAMPLES.gradient),
		slowSamples: bands.slow.samples,
		fastSamples: bands.fast.samples,
	};
};

export interface TUndersteerGradient {
	samples: number;
	/** Road-wheel understeer gradient, ° per G: + understeer, − oversteer. */
	degPerG: number;
	slowDegPerG: number | null;
	fastDegPerG: number | null;
	/** Speed where an understeering car needs twice the geometric lock, km/h. */
	characteristicKmh: number | null;
	/** Speed above which an oversteering car is unstable, km/h. */
	criticalKmh: number | null;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Turns the steering fit into the textbook gradient for a car of wheelbase `wheelbaseM`. */
export const understeerGradient = (
	fit: TSteerFit | null,
	wheelbaseM = DEFAULT_WHEELBASE_M,
): TUndersteerGradient | null => {
	if (!fit) return null;
	const toDeg = (c2: number) => ((wheelbaseM * c2) / fit.c1) * RAD_TO_DEG;
	const kRad = (wheelbaseM * fit.c2) / fit.c1;
	const speedKmh =
		Math.abs(kRad) > 1e-6 ? Math.sqrt((wheelbaseM * G) / Math.abs(kRad)) * 3.6 : null;
	return {
		samples: fit.samples,
		degPerG: kRad * RAD_TO_DEG,
		slowDegPerG: fit.c2Slow === null ? null : toDeg(fit.c2Slow),
		fastDegPerG: fit.c2Fast === null ? null : toDeg(fit.c2Fast),
		characteristicKmh: kRad > 0 ? speedKmh : null,
		criticalKmh: kRad < 0 ? speedKmh : null,
	};
};

export const speedBand = (speedKmh: number): TSpeedBand => {
	if (speedKmh < SLOW_CORNER_KMH) return 'slow';
	return speedKmh > FAST_CORNER_KMH ? 'fast' : 'medium';
};

export interface TSetupEvidence {
	frames: number;
	hasSteering: boolean;
	calibrationSamples: number;
	balance: Record<TCornerPhase, TPhaseBalance>;
	/** Wheels locking under braking. */
	braking: TAxleSlip;
	/** Wheels spinning on throttle. */
	traction: TAxleSlip;
	/** Share of fast samples near the lowest ride height, front and rear; null without data. */
	bottoming: { samples: number; front: number; rear: number } | null;
	/** Mean tyre temperature, front and rear axle, °C. */
	tyres: { samples: number; front: number; rear: number } | null;
	/** Bicycle model fit of steering against curvature and lateral G. */
	steering: TSteerFit | null;
}

/** Collects evidence from live frames; one per session, reset after a setup change. */
export class SetupEvidenceCollector {
	/** Bumps when the summary may have changed; React selectors compare it. */
	version = 0;

	private frames = 0;
	private hasSteering = false;
	private readonly calibration = new SampleBucket();
	private readonly phaseRatios: Record<TCornerPhase, SampleBucket> = {
		entry: new SampleBucket(),
		mid: new SampleBucket(),
		exit: new SampleBucket(),
	};
	private braking = { samples: 0, front: 0, rear: 0 };
	private traction = { samples: 0, front: 0, rear: 0 };
	private readonly frontHeights = new SampleBucket();
	private readonly rearHeights = new SampleBucket();
	private tyres = { samples: 0, front: 0, rear: 0 };
	private gradient: Record<TSpeedBand, TGradientSums> = {
		slow: emptySums(),
		medium: emptySums(),
		fast: emptySums(),
	};
	private cached: TSetupEvidence | null = null;
	private cachedVersion = -1;

	reset(): void {
		this.frames = 0;
		this.hasSteering = false;
		(['calibration', 'frontHeights', 'rearHeights'] as const).forEach(key => {
			this[key].count = 0;
		});
		CORNER_PHASES.forEach(phase => {
			this.phaseRatios[phase].count = 0;
		});
		this.braking = { samples: 0, front: 0, rear: 0 };
		this.traction = { samples: 0, front: 0, rear: 0 };
		this.tyres = { samples: 0, front: 0, rear: 0 };
		this.gradient = { slow: emptySums(), medium: emptySums(), fast: emptySums() };
		this.version += 1;
	}

	push(frame: TTelemetryFrame): void {
		this.frames += 1;
		const speedMs = frame.speed / 3.6;
		const absG = Math.abs(frame.gLat);

		if (frame.steer !== null && speedMs > 1) {
			this.hasSteering = true;
			const curvature = (frame.gLat * G) / (speedMs * speedMs);
			const ratio = curvature !== 0 ? frame.steer / curvature : 0;
			const isSteering = Math.abs(frame.steer) >= MIN_STEER;
			if (
				isSteering &&
				frame.brake < ENTRY_BRAKE &&
				frame.speed >= MIN_CALIBRATION_SPEED_KMH &&
				absG >= CALIBRATION_G[0] &&
				absG < CALIBRATION_G[1]
			) {
				this.calibration.push(ratio);
			}
			if (absG >= CORNER_G && frame.speed >= MIN_CORNER_SPEED_KMH) {
				this.phaseRatios[cornerPhase(frame)].push(isSteering ? ratio : 0);
			}
			if (
				isSteering &&
				frame.brake < ENTRY_BRAKE &&
				frame.speed >= MIN_CALIBRATION_SPEED_KMH &&
				absG >= GRADIENT_MIN_G
			) {
				const sums = this.gradient[speedBand(frame.speed)];
				sums.samples += 1;
				sums.kk += curvature * curvature;
				sums.ka += curvature * frame.gLat;
				sums.aa += frame.gLat * frame.gLat;
				sums.kd += curvature * frame.steer;
				sums.ad += frame.gLat * frame.steer;
			}
		}

		const wheels = frame.wheelSpeeds;
		if (wheels && frame.speed >= MIN_SLIP_SPEED_KMH) {
			const slip = wheels.map(wheel => (wheel - frame.speed) / frame.speed);
			const front = Math.min(slip[0], slip[1]);
			const rear = Math.min(slip[2], slip[3]);
			if (frame.brake >= 0.3) {
				this.braking.samples += 1;
				if (front <= -SLIP_LIMIT) this.braking.front += 1;
				if (rear <= -SLIP_LIMIT) this.braking.rear += 1;
			} else if (frame.throttle >= EXIT_THROTTLE) {
				this.traction.samples += 1;
				if (Math.max(slip[0], slip[1]) >= SLIP_LIMIT) this.traction.front += 1;
				if (Math.max(slip[2], slip[3]) >= SLIP_LIMIT) this.traction.rear += 1;
			}
		}

		if (frame.suspension && frame.speed >= BOTTOMING_SPEED_KMH) {
			this.frontHeights.push(Math.min(frame.suspension[0], frame.suspension[1]));
			this.rearHeights.push(Math.min(frame.suspension[2], frame.suspension[3]));
		}

		if (frame.tyreTemps && frame.speed >= MIN_CORNER_SPEED_KMH) {
			const [fl, fr, rl, rr] = frame.tyreTemps;
			const n = this.tyres.samples;
			this.tyres = {
				samples: n + 1,
				front: (this.tyres.front * n + (fl + fr) / 2) / (n + 1),
				rear: (this.tyres.rear * n + (rl + rr) / 2) / (n + 1),
			};
		}

		if (this.frames % SUMMARY_EVERY_FRAMES === 0) {
			this.version += 1;
		}
	}

	/** Snapshot of the evidence; the same object until `version` changes. */
	summary = (): TSetupEvidence => {
		if (this.cached && this.cachedVersion === this.version) {
			return this.cached;
		}
		const neutral = median(this.calibration.toArray());
		const hasCalibration =
			neutral !== null && neutral !== 0 && this.calibration.count >= MIN_SAMPLES.calibration;
		const balance = CORNER_PHASES.reduce(
			(acc, phase) => {
				const ratios = this.phaseRatios[phase].toArray();
				const relative = hasCalibration ? ratios.map(r => r / (neutral as number)) : [];
				acc[phase] = {
					samples: ratios.length,
					ratio: hasCalibration ? median(relative) : null,
					counterSteerShare: relative.length
						? relative.filter(r => r < 0).length / relative.length
						: 0,
				};
				return acc;
			},
			{} as Record<TCornerPhase, TPhaseBalance>,
		);
		const share = (part: number, total: number): number => (total > 0 ? part / total : 0);
		// Bump stops show up as a pile of samples at the lowest height. A suspension that just
		// moves a lot spreads evenly, so the band above the lowest one must be much emptier.
		const nearMinimum = (bucket: SampleBucket): number => {
			const values = bucket.toArray();
			if (values.length === 0) return 0;
			const lowest = values.reduce((min, v) => Math.min(min, v), Infinity);
			const atStops = values.filter(v => v <= lowest + BOTTOMING_BAND_M).length;
			const above = values.filter(
				v => v > lowest + BOTTOMING_BAND_M && v <= lowest + 2 * BOTTOMING_BAND_M,
			).length;
			return atStops >= 2 * above ? share(atStops, values.length) : 0;
		};

		this.cached = {
			frames: this.frames,
			hasSteering: this.hasSteering,
			calibrationSamples: this.calibration.count,
			balance,
			braking: {
				samples: this.braking.samples,
				frontShare: share(this.braking.front, this.braking.samples),
				rearShare: share(this.braking.rear, this.braking.samples),
			},
			traction: {
				samples: this.traction.samples,
				frontShare: share(this.traction.front, this.traction.samples),
				rearShare: share(this.traction.rear, this.traction.samples),
			},
			bottoming:
				this.frontHeights.count > 0
					? {
							samples: this.frontHeights.count,
							front: nearMinimum(this.frontHeights),
							rear: nearMinimum(this.rearHeights),
						}
					: null,
			tyres: this.tyres.samples > 0 ? { ...this.tyres } : null,
			steering: fitSteering(this.gradient),
		};
		this.cachedVersion = this.version;
		return this.cached;
	};
}

export const cornerPhase = (frame: Pick<TTelemetryFrame, 'brake' | 'throttle'>): TCornerPhase => {
	if (frame.brake >= ENTRY_BRAKE) return 'entry';
	if (frame.throttle >= EXIT_THROTTLE) return 'exit';
	return 'mid';
};

/* ----------------------------------------------------------------------------------------- */
/* Setup sheet                                                                               */
/* ----------------------------------------------------------------------------------------- */

/** Fields of a GT7-style setup screen. Brake balance: + moves braking to the rear. */
export const SETUP_FIELDS = [
	'rideHeightF',
	'rideHeightR',
	'springF',
	'springR',
	'arbF',
	'arbR',
	'compressionF',
	'compressionR',
	'extensionF',
	'extensionR',
	'camberF',
	'camberR',
	'toeF',
	'toeR',
	'downforceF',
	'downforceR',
	'lsdInitial',
	'lsdAccel',
	'lsdBraking',
	'brakeBalance',
] as const;

export type TSetupField = (typeof SETUP_FIELDS)[number];

export type TSetupValues = Partial<Record<TSetupField, number>>;

export interface TFieldSpec {
	min: number;
	max: number;
	/** Input step. */
	step: number;
	/** Size of one suggested change. */
	click: number;
	unit: string;
}

export const SETUP_FIELD_SPECS: Record<TSetupField, TFieldSpec> = {
	rideHeightF: { min: 40, max: 200, step: 1, click: 5, unit: 'mm' },
	rideHeightR: { min: 40, max: 200, step: 1, click: 5, unit: 'mm' },
	springF: { min: 0.5, max: 6, step: 0.01, click: 0.1, unit: 'Hz' },
	springR: { min: 0.5, max: 6, step: 0.01, click: 0.1, unit: 'Hz' },
	arbF: { min: 1, max: 10, step: 1, click: 1, unit: '' },
	arbR: { min: 1, max: 10, step: 1, click: 1, unit: '' },
	compressionF: { min: 10, max: 60, step: 1, click: 5, unit: '%' },
	compressionR: { min: 10, max: 60, step: 1, click: 5, unit: '%' },
	extensionF: { min: 10, max: 60, step: 1, click: 5, unit: '%' },
	extensionR: { min: 10, max: 60, step: 1, click: 5, unit: '%' },
	camberF: { min: 0, max: 6, step: 0.1, click: 0.2, unit: '°' },
	camberR: { min: 0, max: 6, step: 0.1, click: 0.2, unit: '°' },
	toeF: { min: -1, max: 1, step: 0.01, click: 0.05, unit: '°' },
	toeR: { min: -1, max: 1, step: 0.01, click: 0.05, unit: '°' },
	downforceF: { min: 0, max: 1500, step: 5, click: 25, unit: '' },
	downforceR: { min: 0, max: 1500, step: 5, click: 25, unit: '' },
	lsdInitial: { min: 0, max: 60, step: 1, click: 5, unit: '' },
	lsdAccel: { min: 0, max: 60, step: 1, click: 5, unit: '' },
	lsdBraking: { min: 0, max: 60, step: 1, click: 5, unit: '' },
	brakeBalance: { min: -5, max: 5, step: 1, click: 1, unit: '' },
};

/* ----------------------------------------------------------------------------------------- */
/* Advice                                                                                    */
/* ----------------------------------------------------------------------------------------- */

export type TSetupAdviceId =
	| 'entryUndersteer'
	| 'midUndersteer'
	| 'exitUndersteer'
	| 'entryOversteer'
	| 'midOversteer'
	| 'exitOversteer'
	| 'frontLocking'
	| 'rearLocking'
	| 'rearWheelspin'
	| 'frontWheelspin'
	| 'bottomingFront'
	| 'bottomingRear'
	| 'frontTyresHot'
	| 'rearTyresHot'
	| 'tyresCold'
	| 'tyresOverheat'
	| 'highSpeedUndersteer'
	| 'highSpeedOversteer';

export type TAdviceMetric = 'ratio' | 'counterSteer' | 'share' | 'celsius' | 'degPerG';

export type TConfidence = 'low' | 'medium' | 'high';

export interface TSetupChange {
	field: TSetupField;
	/** +1 raise, −1 lower. */
	direction: 1 | -1;
	/** Current value when the driver entered it. */
	from: number | null;
	/** Suggested value, clamped to the field range; null when `from` is unknown. */
	to: number | null;
}

export interface TSetupAdvice {
	id: TSetupAdviceId;
	confidence: TConfidence;
	/** The measurement behind it: a balance ratio, a share of samples or a temperature. */
	metric: TAdviceMetric;
	value: number;
	/** First change to try; the rest are alternatives. Try one at a time. */
	changes: TSetupChange[];
}

export interface TAdviceContext {
	tyreWindowC: { min: number; max: number };
	trackTempC: number | null;
	/** Wheelbase for the understeer gradient, m. */
	wheelbaseM?: number;
}

const RULE_CHANGES: Record<TSetupAdviceId, [TSetupField, 1 | -1][]> = {
	// Turn-in push: let the rear help rotate the car under braking.
	entryUndersteer: [
		['brakeBalance', 1],
		['arbF', -1],
		['lsdBraking', -1],
	],
	midUndersteer: [
		['arbF', -1],
		['arbR', 1],
		['downforceF', 1],
	],
	// Push on power: a tighter diff drives the car straight.
	exitUndersteer: [
		['lsdAccel', -1],
		['arbR', 1],
	],
	entryOversteer: [
		['brakeBalance', -1],
		['lsdBraking', 1],
		['arbR', -1],
	],
	midOversteer: [
		['arbR', -1],
		['downforceR', 1],
		['arbF', 1],
	],
	exitOversteer: [
		['lsdAccel', -1],
		['arbR', -1],
		['downforceR', 1],
	],
	frontLocking: [['brakeBalance', 1]],
	rearLocking: [['brakeBalance', -1]],
	rearWheelspin: [
		['lsdInitial', -1],
		['springR', -1],
		['arbR', -1],
	],
	frontWheelspin: [
		['lsdAccel', -1],
		['springF', -1],
	],
	bottomingFront: [
		['rideHeightF', 1],
		['springF', 1],
	],
	bottomingRear: [
		['rideHeightR', 1],
		['springR', 1],
	],
	// The hotter axle slides more: softer roll stiffness there spreads the load.
	frontTyresHot: [
		['arbF', -1],
		['camberF', -1],
	],
	rearTyresHot: [
		['arbR', -1],
		['camberR', -1],
	],
	tyresCold: [],
	tyresOverheat: [],
	// Balance moves toward understeer as speed grows: the wings, not the bars.
	highSpeedUndersteer: [
		['downforceF', 1],
		['downforceR', -1],
	],
	highSpeedOversteer: [
		['downforceR', 1],
		['downforceF', -1],
	],
};

const roundTo = (value: number, step: number): number => {
	const digits = Math.max(0, -Math.floor(Math.log10(step)));
	return Number((Math.round(value / step) * step).toFixed(digits));
};

export const suggestChange = (
	field: TSetupField,
	direction: 1 | -1,
	setup: TSetupValues | null,
): TSetupChange => {
	const spec = SETUP_FIELD_SPECS[field];
	const from = setup?.[field] ?? null;
	const to =
		from === null
			? null
			: roundTo(
					Math.min(spec.max, Math.max(spec.min, from + direction * spec.click)),
					spec.step,
				);
	return { field, direction, from, to };
};

const confidenceOf = (strength: number, samples: number, minSamples: number): TConfidence => {
	if (samples < minSamples * 2 || strength < 1.3) return 'low';
	if (samples >= minSamples * 5 && strength >= 2) return 'high';
	return 'medium';
};

/**
 * Turns the evidence into setup changes, strongest first. Each finding lists one change to try
 * and alternatives; the driver should change one thing, drive a few laps and look again.
 */
export const adviseSetup = (
	evidence: TSetupEvidence,
	setup: TSetupValues | null,
	context: TAdviceContext,
): TSetupAdvice[] => {
	const found: (TSetupAdvice & { strength: number })[] = [];
	const add = (
		id: TSetupAdviceId,
		metric: TAdviceMetric,
		value: number,
		strength: number,
		samples: number,
		minSamples: number,
	) => {
		found.push({
			id,
			metric,
			value,
			strength,
			confidence: confidenceOf(strength, samples, minSamples),
			changes: RULE_CHANGES[id].map(([field, direction]) =>
				suggestChange(field, direction, setup),
			),
		});
	};

	CORNER_PHASES.forEach(phase => {
		const balance = evidence.balance[phase];
		if (balance.ratio === null || balance.samples < MIN_SAMPLES.phase) {
			return;
		}
		if (balance.counterSteerShare >= COUNTER_STEER_SHARE) {
			add(
				`${phase}Oversteer`,
				'counterSteer',
				balance.counterSteerShare,
				balance.counterSteerShare / COUNTER_STEER_SHARE,
				balance.samples,
				MIN_SAMPLES.phase,
			);
		} else if (balance.ratio >= UNDERSTEER_RATIO) {
			add(
				`${phase}Understeer`,
				'ratio',
				balance.ratio,
				(balance.ratio - 1) / (UNDERSTEER_RATIO - 1),
				balance.samples,
				MIN_SAMPLES.phase,
			);
		} else if (balance.ratio <= OVERSTEER_RATIO) {
			add(
				`${phase}Oversteer`,
				'ratio',
				balance.ratio,
				(1 - balance.ratio) / (1 - OVERSTEER_RATIO),
				balance.samples,
				MIN_SAMPLES.phase,
			);
		}
	});

	const { braking, traction } = evidence;
	if (braking.samples >= MIN_SAMPLES.braking) {
		// Only the axle that locks more: fixing both at once would cancel out.
		if (braking.frontShare >= SLIP_SHARE && braking.frontShare >= braking.rearShare) {
			add(
				'frontLocking',
				'share',
				braking.frontShare,
				braking.frontShare / SLIP_SHARE,
				braking.samples,
				MIN_SAMPLES.braking,
			);
		} else if (braking.rearShare >= SLIP_SHARE) {
			add(
				'rearLocking',
				'share',
				braking.rearShare,
				braking.rearShare / SLIP_SHARE,
				braking.samples,
				MIN_SAMPLES.braking,
			);
		}
	}
	if (traction.samples >= MIN_SAMPLES.traction) {
		if (traction.rearShare >= SLIP_SHARE) {
			add(
				'rearWheelspin',
				'share',
				traction.rearShare,
				traction.rearShare / SLIP_SHARE,
				traction.samples,
				MIN_SAMPLES.traction,
			);
		}
		if (traction.frontShare >= SLIP_SHARE) {
			add(
				'frontWheelspin',
				'share',
				traction.frontShare,
				traction.frontShare / SLIP_SHARE,
				traction.samples,
				MIN_SAMPLES.traction,
			);
		}
	}

	const { bottoming } = evidence;
	if (bottoming && bottoming.samples >= MIN_SAMPLES.bottoming) {
		(['front', 'rear'] as const).forEach(axle => {
			const share = bottoming[axle];
			if (share >= BOTTOMING_SHARE) {
				add(
					axle === 'front' ? 'bottomingFront' : 'bottomingRear',
					'share',
					share,
					share / BOTTOMING_SHARE,
					bottoming.samples,
					MIN_SAMPLES.bottoming,
				);
			}
		});
	}

	const { tyres } = evidence;
	if (tyres && tyres.samples >= MIN_SAMPLES.tyres) {
		const gap = tyres.front - tyres.rear;
		const average = (tyres.front + tyres.rear) / 2;
		const window = context.tyreWindowC;
		if (gap >= TYRE_BALANCE_C) {
			add(
				'frontTyresHot',
				'celsius',
				gap,
				gap / TYRE_BALANCE_C,
				tyres.samples,
				MIN_SAMPLES.tyres,
			);
		} else if (-gap >= TYRE_BALANCE_C) {
			add(
				'rearTyresHot',
				'celsius',
				-gap,
				-gap / TYRE_BALANCE_C,
				tyres.samples,
				MIN_SAMPLES.tyres,
			);
		}
		if (average < window.min) {
			add('tyresCold', 'celsius', average, 1 + (window.min - average) / 10, tyres.samples, 0);
		} else if (average > window.max) {
			add(
				'tyresOverheat',
				'celsius',
				average,
				1 + (average - window.max) / 10,
				tyres.samples,
				0,
			);
		}
	}

	const gradient = understeerGradient(evidence.steering, context.wheelbaseM);
	if (gradient && gradient.slowDegPerG !== null && gradient.fastDegPerG !== null) {
		const shift = gradient.fastDegPerG - gradient.slowDegPerG;
		const samples = Math.min(
			evidence.steering?.slowSamples ?? 0,
			evidence.steering?.fastSamples ?? 0,
		);
		if (Math.abs(shift) >= AERO_GRADIENT_DEG) {
			add(
				shift > 0 ? 'highSpeedUndersteer' : 'highSpeedOversteer',
				'degPerG',
				shift,
				Math.abs(shift) / AERO_GRADIENT_DEG,
				samples,
				MIN_SAMPLES.gradient,
			);
		}
	}

	return found
		.sort((a, b) => b.strength - a.strength)
		.map(item => ({
			id: item.id,
			confidence: item.confidence,
			metric: item.metric,
			value: item.value,
			changes: item.changes,
		}));
};

/** Balance of one phase for display. */
export const balanceState = (
	balance: TPhaseBalance,
): 'understeer' | 'neutral' | 'oversteer' | 'unknown' => {
	if (balance.ratio === null || balance.samples < MIN_SAMPLES.phase) return 'unknown';
	if (balance.counterSteerShare >= COUNTER_STEER_SHARE || balance.ratio <= OVERSTEER_RATIO) {
		return 'oversteer';
	}
	if (balance.ratio >= UNDERSTEER_RATIO) return 'understeer';
	return 'neutral';
};
