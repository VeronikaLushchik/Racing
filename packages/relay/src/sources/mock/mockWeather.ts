import { TWeatherSample } from '@racing/shared';

const smoothstep = (from: number, to: number, x: number): number => {
	const s = Math.min(1, Math.max(0, (x - from) / (to - from)));
	return s * s * (3 - 2 * s);
};

/**
 * A summer afternoon for the demo race: the sun heats the asphalt for the first quarter of an
 * hour, then clouds roll in, the track cools by several degrees, humidity climbs and the wind
 * picks up and turns. Enough of a trend for the weather chart and the tyre advice to react to.
 */
export const mockWeatherAt = (t: number): TWeatherSample => {
	const minutes = t / 60000;
	const heating = 1 - Math.exp(-minutes / 8);
	const clouds = smoothstep(14, 26, minutes);
	const gust = Math.sin(minutes * 1.7) * 0.6 + Math.sin(minutes * 0.45) * 0.4;
	return {
		t: Math.round(t),
		airTempC: Number((25 + 2.5 * heating - 2.2 * clouds).toFixed(1)),
		trackTempC: Number((36 + 8 * heating - 9 * clouds).toFixed(1)),
		humidity: Math.round(44 - 4 * heating + 17 * clouds),
		pressureHpa: Number((1014 - 3 * clouds).toFixed(0)),
		isRaining: false,
		windSpeedMs: Number(Math.max(0.5, 2.4 + 3.4 * clouds + gust).toFixed(1)),
		windDirectionDeg: Math.round((215 + 60 * clouds + minutes * 1.5) % 360),
	};
};
