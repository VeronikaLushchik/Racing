import { TWheelTrend } from '~@engines/racingMath/tyreDegradationModel';

import { MANY_LAPS, WARNING_LAPS } from './strategyConstants';

export const formatSigned = (value: number | null, digits: number, unit = ''): string => {
	if (value === null || !Number.isFinite(value)) {
		return '—';
	}
	const text = Math.abs(value).toFixed(digits);
	const sign = Number(text) === 0 ? '' : value > 0 ? '+' : '−';
	return `${sign}${text}${unit}`;
};

/** 'bad' when already outside, 'warning' when leaving within `WARNING_LAPS`. */
export const trendTone = (trend: TWheelTrend): 'bad' | 'warning' | undefined => {
	if (trend.lapsLeft === null) {
		return undefined;
	}
	if (trend.lapsLeft <= 0) {
		return 'bad';
	}
	return trend.lapsLeft <= WARNING_LAPS ? 'warning' : undefined;
};

export const formatLapsLeft = (lapsLeft: number | null): string => {
	if (lapsLeft === null) {
		return '—';
	}
	if (lapsLeft >= MANY_LAPS) {
		return `${MANY_LAPS}+`;
	}
	return lapsLeft <= 0 ? '0' : lapsLeft.toFixed(1);
};
