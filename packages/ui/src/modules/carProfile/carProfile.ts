import { useSyncExternalStore } from 'react';

import {
	CAR_PROFILES,
	defaultCarProfileId,
	isCarProfileId,
	TCarProfile,
	TCarProfileId,
} from '~@engines/racingMath/carProfiles';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { safeStorage } from 'src/services/functions';

const STORAGE_KEY = 'racing.carProfile';

type TListener = () => void;

/** The car class picked by the driver, saved in this browser; null follows the source. */
class CarProfileChoice {
	private value: TCarProfileId | null = this.load();
	private readonly listeners = new Set<TListener>();

	get = (): TCarProfileId | null => this.value;

	subscribe = (listener: TListener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	set(value: TCarProfileId): void {
		this.value = value;
		safeStorage.set(STORAGE_KEY, value);
		this.listeners.forEach(listener => listener());
	}

	private load(): TCarProfileId | null {
		const stored = safeStorage.get(STORAGE_KEY);
		return isCarProfileId(stored) ? stored : null;
	}
}

export const carProfileChoice = new CarProfileChoice();

export const useCarProfile = (): TCarProfile => {
	const { session } = useTelemetryMeta();
	const chosen = useSyncExternalStore(carProfileChoice.subscribe, carProfileChoice.get);
	return CAR_PROFILES[chosen ?? defaultCarProfileId(session?.source)];
};
