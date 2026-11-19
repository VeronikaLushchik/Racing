/*
 * Local linear trend Kalman filter: a level that moves by a rate each step, and a rate that
 * may itself drift. Used for tyre degradation, where the level is the fuel-corrected lap time
 * and the rate is the time lost per lap of tyre age.
 *
 *   state   x_k = [level, rate]ᵀ
 *   predict x_k = F·x_{k−1},      P_k = F·P_{k−1}·Fᵀ + Q,      F = [[1, 1], [0, 1]]
 *   measure z_k = H·x_k + v,       H = [1, 0],  v ~ N(0, R)
 *   update  S = H·P·Hᵀ + R,  K = P·Hᵀ / S,  x += K·(z − H·x),  P = (I − K·H)·P
 *
 * Steps without a measurement (an invalid lap, a pit lap) only predict. A measurement whose
 * innovation is beyond `gate` standard deviations is treated as an outlier (traffic, a
 * mistake) and skipped, unless the next one lands on the same side: then the car really
 * changed, the second one is accepted and the covariance is inflated (fading memory) so the
 * filter catches up. After the forward pass a Rauch–Tung–Striebel smoother runs
 * backwards so early steps also benefit from later laps.
 */

export type TVector2 = [number, number];
/** Symmetric 2×2 matrix as [p00, p01, p11]. */
export type TCovariance2 = [number, number, number];

export interface TTrendNoise {
	/** Measurement variance R. */
	measurement: number;
	/** Process variance of the level per step. */
	level: number;
	/** Process variance of the rate per step. */
	rate: number;
}

export interface TTrendPrior {
	state: TVector2;
	covariance: TCovariance2;
}

export interface TTrendStep {
	/** Index of the step (tyre age). */
	index: number;
	measurement: number | null;
	/** Measurement was rejected by the gate. */
	isOutlier: boolean;
	/** Filtered estimate after this step. */
	state: TVector2;
	covariance: TCovariance2;
	/** Smoothed estimate (uses every step). */
	smoothed: TVector2;
	smoothedCovariance: TCovariance2;
	/** Innovation z − H·x̂ before the update; null without a measurement. */
	innovation: number | null;
	/** Innovation variance S. */
	innovationVariance: number | null;
}

const predictState = ([level, rate]: TVector2): TVector2 => [level + rate, rate];

/** F·P·Fᵀ + Q for F = [[1, 1], [0, 1]]. */
const predictCovariance = ([p00, p01, p11]: TCovariance2, noise: TTrendNoise): TCovariance2 => [
	p00 + 2 * p01 + p11 + noise.level,
	p01 + p11,
	p11 + noise.rate,
];

/**
 * Runs the filter over steps `first..last`. `measurements` maps a step index to its
 * measurement; missing indices only predict. The prior describes the state at `first`
 * before its measurement.
 */
export const runTrendFilter = (
	measurements: Map<number, number>,
	first: number,
	last: number,
	prior: TTrendPrior,
	noise: TTrendNoise,
	gate = 3,
): TTrendStep[] => {
	const steps: TTrendStep[] = [];
	const predicted: { state: TVector2; covariance: TCovariance2 }[] = [];
	let state = prior.state;
	let covariance = prior.covariance;
	let pendingSign = 0;

	for (let index = first; index <= last; index += 1) {
		if (index > first) {
			state = predictState(state);
			covariance = predictCovariance(covariance, noise);
		}
		predicted.push({ state, covariance });
		const z = measurements.get(index);
		let isOutlier = false;
		let innovation: number | null = null;
		let innovationVariance: number | null = null;
		if (z !== undefined) {
			innovation = z - state[0];
			innovationVariance = covariance[0] + noise.measurement;
			const sign = Math.sign(innovation);
			const ratio = (innovation * innovation) / innovationVariance;
			if (ratio > gate * gate) {
				// A second miss on the same side means the model fell behind the car, not a
				// one-off: accept it, with the prior covariance faded by λ = ν²/S so the
				// filter trusts this lap enough to catch up (fading-memory filter).
				isOutlier = pendingSign !== sign;
				pendingSign = isOutlier ? sign : 0;
				if (!isOutlier) {
					covariance = [
						covariance[0] * ratio,
						covariance[1] * ratio,
						covariance[2] * ratio,
					];
					innovationVariance = covariance[0] + noise.measurement;
				}
			} else {
				pendingSign = 0;
			}
			if (!isOutlier) {
				const k0 = covariance[0] / innovationVariance;
				const k1 = covariance[1] / innovationVariance;
				state = [state[0] + k0 * innovation, state[1] + k1 * innovation];
				covariance = [
					(1 - k0) * covariance[0],
					(1 - k0) * covariance[1],
					covariance[2] - k1 * covariance[1],
				];
			}
		}
		steps.push({
			index,
			measurement: z ?? null,
			isOutlier,
			state,
			covariance,
			smoothed: state,
			smoothedCovariance: covariance,
			innovation,
			innovationVariance,
		});
	}

	// Rauch–Tung–Striebel: x̂s_k = x̂_k + C·(x̂s_{k+1} − x̂⁻_{k+1}), C = P_k·Fᵀ·(P⁻_{k+1})⁻¹.
	for (let i = steps.length - 2; i >= 0; i -= 1) {
		const [p00, p01, p11] = steps[i].covariance;
		const next = predicted[i + 1];
		const [q00, q01, q11] = next.covariance;
		const det = q00 * q11 - q01 * q01;
		if (Math.abs(det) < 1e-15) {
			continue;
		}
		// P·Fᵀ = [[p00 + p01, p01], [p01 + p11, p11]]
		const a00 = p00 + p01;
		const a01 = p01;
		const a10 = p01 + p11;
		const a11 = p11;
		const i00 = q11 / det;
		const i01 = -q01 / det;
		const i11 = q00 / det;
		const c00 = a00 * i00 + a01 * i01;
		const c01 = a00 * i01 + a01 * i11;
		const c10 = a10 * i00 + a11 * i01;
		const c11 = a10 * i01 + a11 * i11;
		const d0 = steps[i + 1].smoothed[0] - next.state[0];
		const d1 = steps[i + 1].smoothed[1] - next.state[1];
		const [s00, s01, s11] = steps[i + 1].smoothedCovariance;
		const e00 = s00 - q00;
		const e01 = s01 - q01;
		const e11 = s11 - q11;
		// P + C·(Ps − P⁻)·Cᵀ
		const m00 = c00 * e00 + c01 * e01;
		const m01 = c00 * e01 + c01 * e11;
		const m10 = c10 * e00 + c11 * e01;
		const m11 = c10 * e01 + c11 * e11;
		steps[i].smoothed = [
			steps[i].state[0] + c00 * d0 + c01 * d1,
			steps[i].state[1] + c10 * d0 + c11 * d1,
		];
		steps[i].smoothedCovariance = [
			p00 + m00 * c00 + m01 * c01,
			p01 + m00 * c10 + m01 * c11,
			p11 + m10 * c10 + m11 * c11,
		];
	}
	return steps;
};

/** Mean and covariance `steps` ahead of a state, with no measurements. */
export const projectTrend = (
	state: TVector2,
	covariance: TCovariance2,
	steps: number,
	noise: TTrendNoise,
): { state: TVector2; covariance: TCovariance2 } => {
	let x = state;
	let p = covariance;
	for (let k = 0; k < steps; k += 1) {
		x = predictState(x);
		p = predictCovariance(p, noise);
	}
	return { state: x, covariance: p };
};

/**
 * Noise of a series that follows a straight line plus white noise σ², from consecutive steps.
 * First differences z_k − z_{k−1} = rate + (ε_k − ε_{k−1}) have variance 2σ² around the rate;
 * a single outlier spoils only two of them, but a change of rate shifts half of them.
 * Second differences z_{k+1} − 2·z_k + z_{k−1} cancel the rate and have variance 6σ²; a
 * change of rate spoils only one, but an outlier three. Each uses the robust spread (MAD),
 * and the smaller of the two is taken, so neither a slow lap nor a cliff inflates the noise.
 * Null with fewer than three second differences.
 */
export const differenceSigma = (points: { index: number; value: number }[]): number | null => {
	const first: number[] = [];
	const second: number[] = [];
	for (let i = 1; i < points.length; i += 1) {
		const [a, b] = [points[i - 1], points[i]];
		if (b.index - a.index !== 1) continue;
		first.push(b.value - a.value);
		const c = points[i + 1];
		if (c && c.index - b.index === 1) {
			second.push(c.value - 2 * b.value + a.value);
		}
	}
	if (second.length < 3) {
		return null;
	}
	return Math.min(robustSigma(first) / Math.SQRT2, robustSigma(second) / Math.sqrt(6));
};

/** Median absolute deviation scaled to a normal standard deviation. */
export const robustSigma = (values: number[]): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const median = sorted[sorted.length >> 1];
	const deviations = values.map(value => Math.abs(value - median)).sort((a, b) => a - b);
	return 1.4826 * deviations[deviations.length >> 1];
};
