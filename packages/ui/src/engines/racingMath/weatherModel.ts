import type { TWeatherSample } from '@racing/shared';

import { fitLine } from './tyreDegradationModel';

export type TTrackCondition = 'dry' | 'damp' | 'wet';

/** What the driver types in when the source has no weather (GT7). */
export interface TManualWeather {
	condition: TTrackCondition;
	airTempC: number;
	trackTempC: number;
}

export interface TWeatherView {
	/** `session`: sent by the source; `manual`: entered by the driver. */
	origin: 'session' | 'manual';
	condition: TTrackCondition;
	airTempC: number;
	trackTempC: number;
	humidity: number | null;
	windSpeedMs: number | null;
	windDirectionDeg: number | null;
	/** Track temperature change, °C per 10 minutes; null with too little history. */
	trackTrendC10: number | null;
}

export type TWeatherAdviceId =
	'rain' | 'damp' | 'hotTrack' | 'coldTrack' | 'warming' | 'cooling' | 'wind' | 'stable';

export interface TWeatherAdvice {
	id: TWeatherAdviceId;
	tone: 'info' | 'warning';
}

export const DEFAULT_MANUAL_WEATHER: TManualWeather = {
	condition: 'dry',
	airTempC: 22,
	trackTempC: 30,
};

/** Track temperature above which tyres overheat easily, °C. */
export const HOT_TRACK_C = 45;
/** Below it tyres take long to reach their window, °C. */
export const COLD_TRACK_C = 20;
/** A change faster than this per 10 minutes is worth telling the driver, °C. */
export const TREND_ALERT_C10 = 1;
/** Wind that moves braking points and upsets the car in fast corners, m/s. */
export const STRONG_WIND_MS = 6;
/** The trend is fitted over this recent stretch of readings, ms. */
const TREND_WINDOW_MS = 20 * 60000;
const MIN_TREND_SPAN_MS = 5 * 60000;

/** Track temperature slope over the last 20 minutes, °C per 10 minutes. */
export const trackTempTrend = (samples: TWeatherSample[]): number | null => {
	if (samples.length < 3) {
		return null;
	}
	const lastT = samples[samples.length - 1].t;
	const recent = samples.filter(sample => sample.t >= lastT - TREND_WINDOW_MS);
	if (recent.length < 3 || lastT - recent[0].t < MIN_TREND_SPAN_MS) {
		return null;
	}
	return fitLine(
		recent.map(sample => sample.t / 600000),
		recent.map(sample => sample.trackTempC),
	).slope;
};

/** The weather the dashboard shows: what the source sent, else what the driver entered. */
export const resolveWeather = (samples: TWeatherSample[], manual: TManualWeather): TWeatherView => {
	const latest = samples[samples.length - 1];
	if (!latest) {
		return {
			origin: 'manual',
			condition: manual.condition,
			airTempC: manual.airTempC,
			trackTempC: manual.trackTempC,
			humidity: null,
			windSpeedMs: null,
			windDirectionDeg: null,
			trackTrendC10: null,
		};
	}
	return {
		origin: 'session',
		condition: latest.isRaining ? 'wet' : 'dry',
		airTempC: latest.airTempC,
		trackTempC: latest.trackTempC,
		humidity: latest.humidity,
		windSpeedMs: latest.windSpeedMs,
		windDirectionDeg: latest.windDirectionDeg,
		trackTrendC10: trackTempTrend(samples),
	};
};

/** Plain rules of thumb about what the conditions mean for tyres and driving. */
export const weatherAdvice = (view: TWeatherView): TWeatherAdvice[] => {
	const advice: TWeatherAdvice[] = [];
	if (view.condition === 'wet') {
		advice.push({ id: 'rain', tone: 'warning' });
	} else if (view.condition === 'damp') {
		advice.push({ id: 'damp', tone: 'warning' });
	}
	if (view.condition !== 'wet') {
		if (view.trackTempC >= HOT_TRACK_C) {
			advice.push({ id: 'hotTrack', tone: 'warning' });
		} else if (view.trackTempC <= COLD_TRACK_C) {
			advice.push({ id: 'coldTrack', tone: 'warning' });
		}
	}
	if (view.trackTrendC10 !== null && view.trackTrendC10 >= TREND_ALERT_C10) {
		advice.push({ id: 'warming', tone: 'info' });
	} else if (view.trackTrendC10 !== null && view.trackTrendC10 <= -TREND_ALERT_C10) {
		advice.push({ id: 'cooling', tone: 'info' });
	}
	if (view.windSpeedMs !== null && view.windSpeedMs >= STRONG_WIND_MS) {
		advice.push({ id: 'wind', tone: 'info' });
	}
	return advice.length ? advice : [{ id: 'stable', tone: 'info' }];
};

/** Compass point (N, NE, …) the wind comes from. */
export const compassPoint = (degrees: number): string => {
	const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
	return points[index];
};

export const isTrackCondition = (value: unknown): value is TTrackCondition =>
	value === 'dry' || value === 'damp' || value === 'wet';
