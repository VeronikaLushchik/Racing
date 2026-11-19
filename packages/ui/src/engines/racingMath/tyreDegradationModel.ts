import type { TLapRecord } from '../../modules/telemetry/lapTypings';

import {
	projectTrend,
	differenceSigma,
	runTrendFilter,
	TCovariance2,
	TTrendNoise,
} from './kalmanTrendModel';

/** Lap-time cost of carrying fuel, s per litre. A common rule of thumb; real cars differ. */
export const FUEL_EFFECT_S_PER_L = 0.03;
export const FIT_LAPS = 5;
export const MIN_FIT_LAPS = 3;
/** Width of the prediction band, in standard errors (about 95%). */
const BAND_SIGMAS = 2;
/** Lap-to-lap noise used until there are enough laps to measure it, s. */
export const DEFAULT_NOISE_S = 0.2;
/** Floor on the measured noise: a game timer is not more precise than this, s. */
const MIN_NOISE_S = 0.05;
/** How far the corrected pace may wander per lap on its own (track rubber, wind), s. */
export const LEVEL_DRIFT_S = 0.02;
/** How far the degradation rate may change per lap, s/lap. This is what lets a cliff show. */
export const RATE_DRIFT_S = 0.01;
/** Prior spread of the degradation rate before any laps, s/lap. Wide on purpose. */
const PRIOR_RATE_S = 0.5;
/** Innovation gate: a lap further than this many sigmas from the prediction is an outlier. */
export const OUTLIER_SIGMAS = 3;
/** Rise of the degradation rate over the stint that counts as the tyres falling off, s/lap. */
export const CLIFF_RATE_S = 0.08;

export interface TLinearFit {
	slope: number;
	intercept: number;
	/** Standard deviation of the residuals. */
	sigma: number;
	meanX: number;
	sxx: number;
	count: number;
}

export interface TStintLap {
	lap: number;
	/** Laps on this set of tyres when the lap ended (1 for the first). */
	tyreAge: number;
	lapTimeS: number;
	/** Lap time with the fuel load taken out, s. */
	correctedS: number;
	fuelL: number | null;
}

export interface TForecastLap {
	lap: number;
	tyreAge: number;
	/** Predicted lap time with the expected fuel load, s. */
	lapTimeS: number;
	low: number;
	high: number;
}

export type TWheelTrend = {
	current: number | null;
	/** Change per lap. */
	slope: number | null;
	/** Laps until the value leaves the window; 0 when already outside, null when it never does. */
	lapsLeft: number | null;
};

/** Smoothed trend at one lap of the stint. */
export interface TTrendLap {
	lap: number;
	tyreAge: number;
	/** Smoothed fuel-corrected lap time, s. */
	correctedS: number;
	/** The same with that lap's fuel load added back, for plotting next to raw times, s. */
	lapTimeS: number;
	/** Smoothed degradation rate at this lap, s per lap. */
	rateS: number;
}

/** Filter state at the end of the stint: what strategy simulations start from. */
export interface TDegradationState {
	tyreAge: number;
	/** Fuel-corrected lap time at the current tyre age, s. */
	paceS: number;
	/** Time lost per lap of tyre age, s. */
	rateS: number;
	/** Covariance of [pace, rate]. */
	covariance: TCovariance2;
}

export interface TDegradationResult {
	stint: TStintLap[];
	/** Clean laps the filter accepted. */
	fitLaps: TStintLap[];
	/** Lap numbers the filter rejected as outliers. */
	outlierLaps: number[];
	trend: TTrendLap[];
	/** Fuel-corrected time lost per lap of tyre age, now, s. */
	degradationS: number;
	/** Standard deviation of `degradationS`. */
	degradationSigma: number;
	/** Lap-to-lap noise of a clean lap, s. */
	noiseS: number;
	state: TDegradationState;
	/** How much the degradation rate rose from the start of the stint, s per lap. */
	rateChangeS: number;
	/** The rate rose by more than `CLIFF_RATE_S`: the tyres are falling off. */
	isCliff: boolean;
	fuelPerLapL: number | null;
	forecast: TForecastLap[];
	temperature: TWheelTrend[] | null;
	wear: TWheelTrend[] | null;
}

/** Ordinary least squares y = intercept + slope·x. */
export const fitLine = (xs: number[], ys: number[]): TLinearFit => {
	const count = xs.length;
	const meanX = xs.reduce((sum, x) => sum + x, 0) / count;
	const meanY = ys.reduce((sum, y) => sum + y, 0) / count;
	let sxx = 0;
	let sxy = 0;
	xs.forEach((x, i) => {
		sxx += (x - meanX) ** 2;
		sxy += (x - meanX) * (ys[i] - meanY);
	});
	const slope = sxx > 0 ? sxy / sxx : 0;
	const intercept = meanY - slope * meanX;
	const residual = ys.reduce((sum, y, i) => sum + (y - (intercept + slope * xs[i])) ** 2, 0);
	const sigma = count > 2 ? Math.sqrt(residual / (count - 2)) : 0;
	return { slope, intercept, sigma, meanX, sxx, count };
};

/**
 * Laps of the current stint: everything after the last pit lap. The out-lap itself and
 * invalid laps stay in the stint (they age the tyres) but are not used for the fit.
 */
export const currentStint = (records: TLapRecord[]): { lap: TLapRecord; tyreAge: number }[] => {
	let start = 0;
	records.forEach((record, i) => {
		if (record.isPitLap) {
			start = i + 1;
		}
	});
	return records.slice(start).map((lap, i) => ({ lap, tyreAge: i + 1 }));
};

const trendOf = (
	values: (number | null)[],
	ages: number[],
	window: { min: number; max: number },
): TWheelTrend => {
	const points = values
		.map((value, i) => ({ value, age: ages[i] }))
		.filter((point): point is { value: number; age: number } => point.value !== null);
	const current = points.length > 0 ? points[points.length - 1].value : null;
	if (points.length < 2 || current === null) {
		return { current, slope: null, lapsLeft: null };
	}
	const { slope } = fitLine(
		points.map(point => point.age),
		points.map(point => point.value),
	);
	let lapsLeft: number | null = null;
	if (current < window.min || current > window.max) {
		lapsLeft = 0;
	} else if (slope > 1e-6) {
		lapsLeft = (window.max - current) / slope;
	} else if (slope < -1e-6) {
		lapsLeft = (current - window.min) / -slope;
	}
	return {
		current,
		slope,
		lapsLeft: lapsLeft !== null && Number.isFinite(lapsLeft) ? lapsLeft : null,
	};
};

/**
 * Kalman filter over the stint: the state is the fuel-corrected lap time at the current tyre
 * age and the time lost per lap of age (see `kalmanTrendModel`). Every clean lap after the
 * out-lap is a measurement; laps the gate rejects (traffic, a mistake) are reported as
 * outliers. Measurement noise comes from the laps themselves (robust spread around a straight
 * line), process noise lets the rate drift so a tyre "cliff" shows up as a rising rate.
 * Null until `MIN_FIT_LAPS` clean laps exist.
 */
export const modelDegradation = (
	records: TLapRecord[],
	options: {
		horizon: number;
		temperatureWindow: { min: number; max: number };
		wearLimit: number;
		fuelEffect?: number;
	},
): TDegradationResult | null => {
	const fuelEffect = options.fuelEffect ?? FUEL_EFFECT_S_PER_L;
	const stintRecords = currentStint(records);
	const stint: TStintLap[] = stintRecords.map(({ lap, tyreAge }) => {
		const lapTimeS = lap.lapTimeMs / 1000;
		const fuelL =
			lap.fuelStart !== null && lap.fuelEnd !== null
				? (lap.fuelStart + lap.fuelEnd) / 2
				: null;
		return {
			lap: lap.lap,
			tyreAge,
			lapTimeS,
			correctedS: fuelL === null ? lapTimeS : lapTimeS - fuelL * fuelEffect,
			fuelL,
		};
	});

	const clean = stint.filter((_, i) => {
		const record = stintRecords[i].lap;
		return record.isValid && !record.isPitLap && stintRecords[i].tyreAge > 1;
	});
	if (clean.length < MIN_FIT_LAPS) {
		return null;
	}

	const noise = estimateNoise(clean);
	const first = clean[0];
	const last = stint[stint.length - 1];
	const steps = runTrendFilter(
		new Map(clean.map(lap => [lap.tyreAge, lap.correctedS])),
		first.tyreAge,
		last.tyreAge,
		{
			state: [first.correctedS, 0],
			covariance: [noise.measurement + 1, 0, PRIOR_RATE_S ** 2],
		},
		noise,
		OUTLIER_SIGMAS,
	);
	const outlierAges = new Set(steps.filter(step => step.isOutlier).map(step => step.index));
	const fitLaps = clean.filter(lap => !outlierAges.has(lap.tyreAge));
	const outlierLaps = clean.filter(lap => outlierAges.has(lap.tyreAge)).map(lap => lap.lap);
	const final = steps[steps.length - 1];

	const trend: TTrendLap[] = steps.map(step => {
		const lap = stint.find(item => item.tyreAge === step.index) as TStintLap;
		const fuelOffset = lap.lapTimeS - lap.correctedS;
		return {
			lap: lap.lap,
			tyreAge: step.index,
			correctedS: step.smoothed[0],
			lapTimeS: step.smoothed[0] + fuelOffset,
			rateS: step.smoothed[1],
		};
	});
	const rateChangeS = trend[trend.length - 1].rateS - trend[0].rateS;

	const burns = stintRecords
		.map(({ lap }) =>
			lap.fuelStart !== null && lap.fuelEnd !== null ? lap.fuelStart - lap.fuelEnd : null,
		)
		.filter((burn): burn is number => burn !== null && burn > 0);
	const fuelPerLapL =
		burns.length > 0 ? burns.reduce((sum, burn) => sum + burn, 0) / burns.length : null;

	const lastRecord = stintRecords[stintRecords.length - 1].lap;
	let fuel = lastRecord.fuelEnd;
	const forecast: TForecastLap[] = [];
	for (let k = 1; k <= options.horizon; k += 1) {
		const tyreAge = last.tyreAge + k;
		const fuelMid =
			fuel !== null && fuelPerLapL !== null ? Math.max(0, fuel - fuelPerLapL / 2) : null;
		if (fuel !== null && fuelPerLapL !== null) {
			fuel = Math.max(0, fuel - fuelPerLapL);
		}
		const projected = projectTrend(final.state, final.covariance, k, noise);
		const lapTimeS = projected.state[0] + (fuelMid ?? 0) * fuelEffect;
		const spread =
			BAND_SIGMAS * Math.sqrt(Math.max(0, projected.covariance[0]) + noise.measurement);
		forecast.push({
			lap: last.lap + k,
			tyreAge,
			lapTimeS,
			low: lapTimeS - spread,
			high: lapTimeS + spread,
		});
	}

	const ages = stintRecords.map(item => item.tyreAge);
	const recent = stintRecords.slice(-FIT_LAPS);
	const recentAges = ages.slice(-FIT_LAPS);
	const hasTemps = recent.some(item => item.lap.tyreTempAvg !== null);
	const hasWear = recent.some(item => item.lap.tyreWearEnd !== null);

	return {
		stint,
		fitLaps,
		outlierLaps,
		trend,
		degradationS: final.state[1],
		degradationSigma: Math.sqrt(Math.max(0, final.covariance[2])),
		noiseS: Math.sqrt(noise.measurement),
		state: {
			tyreAge: last.tyreAge,
			paceS: final.state[0],
			rateS: final.state[1],
			covariance: final.covariance,
		},
		rateChangeS,
		isCliff: rateChangeS >= CLIFF_RATE_S,
		fuelPerLapL,
		forecast,
		temperature: hasTemps
			? [0, 1, 2, 3].map(wheel =>
					trendOf(
						recent.map(item => item.lap.tyreTempAvg?.[wheel] ?? null),
						recentAges,
						options.temperatureWindow,
					),
				)
			: null,
		wear: hasWear
			? [0, 1, 2, 3].map(wheel =>
					trendOf(
						recent.map(item => item.lap.tyreWearEnd?.[wheel] ?? null),
						recentAges,
						{ min: -Infinity, max: options.wearLimit },
					),
				)
			: null,
	};
};

/**
 * Lap-to-lap noise from the clean laps: the robust spread of their lap-to-lap differences
 * (see `differenceSigma`), so neither a slow lap nor a cliff inflates it. Too few laps fall
 * back to a default.
 */
export const estimateNoise = (laps: TStintLap[]): TTrendNoise => {
	const measured = differenceSigma(
		laps.map(lap => ({ index: lap.tyreAge, value: lap.correctedS })),
	);
	const sigma = measured === null ? DEFAULT_NOISE_S : Math.max(MIN_NOISE_S, measured);
	return { measurement: sigma ** 2, level: LEVEL_DRIFT_S ** 2, rate: RATE_DRIFT_S ** 2 };
};
