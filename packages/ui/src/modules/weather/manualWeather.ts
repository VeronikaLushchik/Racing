import { useSyncExternalStore } from 'react';

import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { safeStorage } from 'src/services/functions';
import {
	DEFAULT_MANUAL_WEATHER,
	isTrackCondition,
	resolveWeather,
	TManualWeather,
	TWeatherView,
} from '~@engines/racingMath/weatherModel';

const STORAGE_KEY = 'racing.manualWeather';

type TListener = () => void;

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/** Conditions the driver entered for sources without weather (GT7), saved in this browser. */
class ManualWeatherChoice {
	private value: TManualWeather = this.load();
	private readonly listeners = new Set<TListener>();

	get = (): TManualWeather => this.value;

	subscribe = (listener: TListener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	set(patch: Partial<TManualWeather>): void {
		this.value = { ...this.value, ...patch };
		safeStorage.set(STORAGE_KEY, JSON.stringify(this.value));
		this.listeners.forEach(listener => listener());
	}

	private load(): TManualWeather {
		try {
			const stored = JSON.parse(safeStorage.get(STORAGE_KEY) ?? 'null') as Record<
				string,
				unknown
			> | null;
			if (!stored) {
				return DEFAULT_MANUAL_WEATHER;
			}
			return {
				condition: isTrackCondition(stored.condition)
					? stored.condition
					: DEFAULT_MANUAL_WEATHER.condition,
				airTempC: isFiniteNumber(stored.airTempC)
					? stored.airTempC
					: DEFAULT_MANUAL_WEATHER.airTempC,
				trackTempC: isFiniteNumber(stored.trackTempC)
					? stored.trackTempC
					: DEFAULT_MANUAL_WEATHER.trackTempC,
			};
		} catch {
			return DEFAULT_MANUAL_WEATHER;
		}
	}
}

export const manualWeather = new ManualWeatherChoice();

export const useManualWeather = (): TManualWeather =>
	useSyncExternalStore(manualWeather.subscribe, manualWeather.get);

/** Current conditions: from the source when it reports weather, otherwise the driver's input. */
export const useWeather = (): TWeatherView => {
	const { weather } = useTelemetryMeta();
	const manual = useManualWeather();
	return resolveWeather(weather, manual);
};
