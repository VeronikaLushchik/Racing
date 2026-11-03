export const TRACE_CHANNELS = [
	't',
	'speed',
	'throttle',
	'brake',
	'gear',
	'rpm',
	'gLat',
	'gLong',
	'lapDistance',
] as const;

export type TTraceChannel = (typeof TRACE_CHANNELS)[number];

/**
 * Fixed-size circular buffer with one typed array per channel. Pushing a frame never allocates,
 * which keeps garbage collection out of the 60 fps render loop.
 */
export class TelemetryRingBuffer {
	private readonly data: Record<TTraceChannel, Float64Array>;
	private head = 0;
	private length = 0;

	constructor(readonly capacity: number) {
		this.data = TRACE_CHANNELS.reduce(
			(acc, channel) => {
				acc[channel] = new Float64Array(capacity);
				return acc;
			},
			{} as Record<TTraceChannel, Float64Array>,
		);
	}

	get count(): number {
		return this.length;
	}

	push(values: Record<TTraceChannel, number>): void {
		for (const channel of TRACE_CHANNELS) this.data[channel][this.head] = values[channel];
		this.head = (this.head + 1) % this.capacity;
		this.length = Math.min(this.capacity, this.length + 1);
	}

	/** Value of the i-th oldest sample (0 = oldest still stored). */
	get(channel: TTraceChannel, i: number): number {
		const start = (this.head - this.length + this.capacity) % this.capacity;
		return this.data[channel][(start + i) % this.capacity];
	}

	latest(channel: TTraceChannel): number | null {
		return this.length === 0 ? null : this.get(channel, this.length - 1);
	}

	/** Index of the first sample with t >= since (binary search, samples are time ordered). */
	firstIndexSince(since: number): number {
		let lo = 0;
		let hi = this.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.get('t', mid) < since) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	clear(): void {
		this.head = 0;
		this.length = 0;
	}
}
