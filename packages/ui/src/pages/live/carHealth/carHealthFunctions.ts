/** @format */

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
