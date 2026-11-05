export type TTempState = 'cold' | 'optimal' | 'hot';

export const temperatureState = (
	value: number,
	window: { min: number; max: number },
): TTempState => {
	if (value < window.min) return 'cold';
	if (value > window.max) return 'hot';
	return 'optimal';
};

/** 0..1 position of a temperature on a scale that spans 30 °C beyond each edge of the window. */
export const temperatureRatio = (value: number, window: { min: number; max: number }): number => {
	const span = window.max - window.min;
	const low = window.min - span;
	const high = window.max + span;
	return Math.min(1, Math.max(0, (value - low) / (high - low)));
};

export type TSlipState = 'lock' | 'grip' | 'spin';

/** Below this the slip ratio is too noisy to mean anything, km/h. */
export const MIN_SLIP_SPEED_KMH = 20;
/** Slip ratio beyond which a wheel counts as locking or spinning. */
export const SLIP_THRESHOLD = 0.05;

/** (wheel − car) / car: negative when the wheel turns slower (locking), positive when faster. */
export const slipRatio = (wheelKmh: number, carKmh: number): number | null =>
	carKmh < MIN_SLIP_SPEED_KMH ? null : (wheelKmh - carKmh) / carKmh;

export const slipState = (ratio: number | null): TSlipState => {
	if (ratio === null) return 'grip';
	if (ratio <= -SLIP_THRESHOLD) return 'lock';
	if (ratio >= SLIP_THRESHOLD) return 'spin';
	return 'grip';
};
