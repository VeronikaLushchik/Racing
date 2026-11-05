import type { TSourceKind } from '@racing/shared';

import { DEFAULT_PIT_LOSS_S, WARM_UP_LOSS_S } from './pitWindowModel';
import { FUEL_EFFECT_S_PER_L } from './tyreDegradationModel';

export type TCarProfileId = 'gt3' | 'f1' | 'road';

export interface TTemperatureWindow {
	min: number;
	max: number;
}

/**
 * Car class constants that strategy and car health depend on. The values are public rules of
 * thumb, not data for a specific car: good enough to make the models comparable between
 * classes, and the place to put real numbers once a car is known.
 */
export interface TCarProfile {
	id: TCarProfileId;
	/** Lap-time cost of carrying one litre of fuel, s. */
	fuelEffectSPerL: number;
	/** Working window of the slicks (or road tyres), °C. */
	tyreWindowC: TTemperatureWindow;
	/** Typical time lost driving through the pit lane, s. */
	pitLossS: number;
	/** Time lost on the out-lap while new tyres come up to temperature, s. */
	warmUpLossS: number;
}

export const CAR_PROFILES: Record<TCarProfileId, TCarProfile> = {
	gt3: {
		id: 'gt3',
		fuelEffectSPerL: FUEL_EFFECT_S_PER_L,
		tyreWindowC: { min: 80, max: 105 },
		pitLossS: DEFAULT_PIT_LOSS_S,
		warmUpLossS: WARM_UP_LOSS_S,
	},
	f1: {
		id: 'f1',
		// About 0.03 s per kg at 0.75 kg/L.
		fuelEffectSPerL: 0.025,
		tyreWindowC: { min: 90, max: 115 },
		pitLossS: 21,
		warmUpLossS: 1.5,
	},
	road: {
		id: 'road',
		fuelEffectSPerL: 0.04,
		tyreWindowC: { min: 60, max: 90 },
		pitLossS: 25,
		warmUpLossS: 0.5,
	},
};

export const CAR_PROFILE_IDS = Object.keys(CAR_PROFILES) as TCarProfileId[];

/** Profile used until the driver picks one: real F1 data gets F1, sims get GT3. */
export const defaultCarProfileId = (source: TSourceKind | null | undefined): TCarProfileId =>
	source === 'f1' ? 'f1' : 'gt3';

export const isCarProfileId = (value: unknown): value is TCarProfileId =>
	typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAR_PROFILES, value);
