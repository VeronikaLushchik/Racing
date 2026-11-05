/** Distance → elapsed-time trace of one lap, used for the live delta and later the ghost lap. */
export class LapTrace {
	readonly distance: number[] = [];
	readonly timeMs: number[] = [];

	constructor(readonly lap: number) {}

	/** Trace rebuilt from a stored lap (for example after a page reload). */
	static fromArrays(
		lap: number,
		distance: ArrayLike<number>,
		timeMs: ArrayLike<number>,
	): LapTrace {
		const trace = new LapTrace(lap);
		for (let i = 0; i < distance.length; i += 1) {
			trace.push(distance[i], timeMs[i]);
		}
		return trace;
	}

	push(distance: number, timeMs: number): void {
		const last = this.distance[this.distance.length - 1];
		// Keep distance strictly increasing so the trace can be searched.
		if (last !== undefined && distance <= last) return;
		this.distance.push(distance);
		this.timeMs.push(timeMs);
	}

	get length(): number {
		return this.distance.length;
	}
}

/** Elapsed time on `trace` at `distance`, linearly interpolated; null outside the trace. */
export const timeAtDistance = (trace: LapTrace, distance: number): number | null => {
	const d = trace.distance;
	if (d.length < 2 || distance < d[0] || distance > d[d.length - 1]) return null;
	let lo = 0;
	let hi = d.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (d[mid] <= distance) lo = mid;
		else hi = mid;
	}
	const span = d[hi] - d[lo];
	const k = span > 0 ? (distance - d[lo]) / span : 0;
	return trace.timeMs[lo] + (trace.timeMs[hi] - trace.timeMs[lo]) * k;
};

/** Seconds gained (negative) or lost (positive) against the reference lap at this point. */
export const computeDelta = (
	reference: LapTrace | null,
	distance: number,
	lapTimeMs: number,
): number | null => {
	if (!reference) return null;
	const referenceTime = timeAtDistance(reference, distance);
	return referenceTime === null ? null : (lapTimeMs - referenceTime) / 1000;
};
