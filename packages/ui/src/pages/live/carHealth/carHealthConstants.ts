export const BRAKE_WINDOW_C = { min: 300, max: 800 };
export const CAR_HEALTH_HZ = 5;
export const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;
/** Typical warm engine, °C. */
export const WATER_WINDOW_C = { min: 75, max: 105 };
export const OIL_WINDOW_C = { min: 85, max: 125 };
/** Slip state shown with the colour of the matching temperature state. */
export const SLIP_COLOR_STATE = { lock: 'cold', grip: 'optimal', spin: 'hot' } as const;
export const SLIP_LABEL = {
	lock: 'car.slipLock',
	grip: 'car.slipGrip',
	spin: 'car.slipSpin',
} as const;
