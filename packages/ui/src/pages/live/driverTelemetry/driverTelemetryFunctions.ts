/** Axis limit for the G-G diagram: whole G above the largest value seen, at least 2 G. */
export const ggAxisLimit = (maxAbsG: number): number => Math.max(2, Math.ceil(maxAbsG + 0.1));

/** Trail braking: still on the brake while the car is already turning. */
export const isTrailBraking = (brake: number, gLat: number): boolean =>
	brake > 0.05 && Math.abs(gLat) > 0.5;

/** Alpha for a point of age `ageMs` in a trail that lasts `windowMs`. */
export const trailAlpha = (ageMs: number, windowMs: number): number =>
	Math.max(0.05, 1 - ageMs / windowMs);
