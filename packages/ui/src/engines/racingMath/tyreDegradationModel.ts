import type { TLapRecord } from '../../modules/telemetry/lapTypings';

/** Lap-time cost of carrying fuel, s per litre. A common rule of thumb; real cars differ. */
export const FUEL_EFFECT_S_PER_L = 0.03;
export const FIT_LAPS = 5;
export const MIN_FIT_LAPS = 3;
/** Width of the prediction band, in standard errors (about 95%). */
const BAND_SIGMAS = 2;

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

export interface TDegradationResult {
	stint: TStintLap[];
	fitLaps: TStintLap[];
	fit: TLinearFit;
	/** Fuel-corrected time lost per lap of tyre age, s. */
	degradationS: number;
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

/** Half-width of the prediction band at `x`. */
export const predictionSpread = (fit: TLinearFit, x: number): number =>
	BAND_SIGMAS *
	fit.sigma *
	Math.sqrt(1 + 1 / fit.count + (fit.sxx > 0 ? (x - fit.meanX) ** 2 / fit.sxx : 0));

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
 * Fits fuel-corrected lap time against tyre age over the last `FIT_LAPS` clean laps of the
 * stint and projects `horizon` laps ahead. Null until `MIN_FIT_LAPS` clean laps exist.
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
	const stint: TStintLap[] = currentStint(records).map(({ lap, tyreAge }) => {
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

	const stintRecords = currentStint(records);
	const clean = stint.filter((_, i) => {
		const record = stintRecords[i].lap;
		return record.isValid && !record.isPitLap && stintRecords[i].tyreAge > 1;
	});
	const fitLaps = clean.slice(-FIT_LAPS);
	if (fitLaps.length < MIN_FIT_LAPS) {
		return null;
	}

	const fit = fitLine(
		fitLaps.map(lap => lap.tyreAge),
		fitLaps.map(lap => lap.correctedS),
	);

	const burns = stintRecords
		.map(({ lap }) =>
			lap.fuelStart !== null && lap.fuelEnd !== null ? lap.fuelStart - lap.fuelEnd : null,
		)
		.filter((burn): burn is number => burn !== null && burn > 0);
	const fuelPerLapL =
		burns.length > 0 ? burns.reduce((sum, burn) => sum + burn, 0) / burns.length : null;

	const last = stint[stint.length - 1];
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
		const corrected = fit.intercept + fit.slope * tyreAge;
		const lapTimeS = corrected + (fuelMid ?? 0) * fuelEffect;
		const spread = predictionSpread(fit, tyreAge);
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
		fit,
		degradationS: fit.slope,
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
