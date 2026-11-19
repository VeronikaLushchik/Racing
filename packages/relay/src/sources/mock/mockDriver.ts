import { TCorner } from './mockTrack';

/** Small seeded generator (mulberry32), so a demo race can be repeated in tests. */
export const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let r = Math.imul(state ^ (state >>> 15), 1 | state);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
};

/** Normal distribution from two uniform numbers (Box–Muller). */
export const gaussian = (random: () => number, sigma = 1): number =>
	Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random()) * sigma;

/** How the demo driver takes one corner: the same weak spots every lap, plus lap noise. */
interface TCornerHabit {
	/** Share of the grip used at the apex, 1 = on the limit. */
	grip: number;
	/** Share of the braking used, below 1 = brakes early. */
	braking: number;
	/** Lap-to-lap spread of the grip, as a share. */
	spread: number;
}

export type TMistakeKind = 'lockup' | 'offTrack' | 'wide';

export interface TMistake {
	kind: TMistakeKind;
	corner: TCorner;
}

/** The driver's plan for one lap: what the speed profile is shaped by. */
export interface TLapPlan {
	cornerFactor: Float32Array;
	brakeFactor: Float32Array;
	mistake: TMistake | null;
}

/** Brake zones start this far before the corner, m. */
const BRAKE_ZONE_M = 260;
/** The corner grip factor blends in and out over this distance, m. */
const CORNER_BLEND_M = 25;

/**
 * A believable amateur racer: quick in most corners, with a couple of habits a coach would spot
 * (one corner braked early, one taken too slowly, one where pace comes and goes), some lap
 * noise, a slow first lap while learning the grip, and an occasional mistake.
 */
export class DemoDriver {
	private readonly habits: TCornerHabit[];

	constructor(
		private readonly corners: TCorner[],
		private readonly trackLength: number,
		private readonly random: () => number,
	) {
		const count = corners.length;
		const pick = (offset: number): number => Math.floor(count * offset) % count;
		const earlyBraker = pick(0.3);
		const slowCorner = pick(0.62);
		const nervousCorner = pick(0.85);
		this.habits = corners.map((_, i) => ({
			grip: 0.975 + gaussian(random, 0.006) - (i === slowCorner ? 0.04 : 0),
			braking: 0.92 - (i === earlyBraker ? 0.14 : 0),
			spread: i === nervousCorner ? 0.025 : 0.009,
		}));
	}

	/** Plans lap `lap`; `confidence` is 0 on cold tyres and 1 once they are in the window. */
	planLap(lap: number, confidence: number): TLapPlan {
		const n = this.trackLength;
		const cornerFactor = new Float32Array(n).fill(1);
		const brakeFactor = new Float32Array(n).fill(1);
		const learning = lap <= 1 ? 0.02 : lap === 2 ? 0.008 : 0;
		const caution = (1 - confidence) * 0.015;

		const mistake = this.pickMistake(lap);
		// Some laps just flow better than others.
		const form = gaussian(this.random, 0.006);
		this.corners.forEach((corner, i) => {
			const habit = this.habits[i];
			let grip = habit.grip + form + gaussian(this.random, habit.spread) - learning - caution;
			let braking = habit.braking * (1 + gaussian(this.random, 0.025)) - learning;
			if (mistake?.corner === corner) {
				// A lockup or a late dive ruins the apex; running wide loses the exit.
				if (mistake.kind === 'lockup') {
					braking = 1.02;
					grip -= 0.15;
				} else if (mistake.kind === 'offTrack') {
					grip -= 0.1;
				} else {
					grip -= 0.07;
				}
			}
			grip = Math.min(1.0, Math.max(0.75, grip));
			braking = Math.min(1.02, Math.max(0.7, braking));
			const from = corner.start - CORNER_BLEND_M;
			const to = this.span(corner) + CORNER_BLEND_M;
			for (let d = from; d <= to; d += 1) {
				const edge = Math.min(d - from, to - d) / CORNER_BLEND_M;
				const weight = Math.min(1, edge);
				cornerFactor[this.wrap(d)] = Math.min(
					cornerFactor[this.wrap(d)],
					1 - (1 - grip) * weight,
				);
			}
			for (let d = corner.start - BRAKE_ZONE_M; d <= corner.start + 30; d += 1) {
				brakeFactor[this.wrap(d)] = braking;
			}
		});
		return { cornerFactor, brakeFactor, mistake };
	}

	private pickMistake(lap: number): TMistake | null {
		if (lap < 2) return null;
		const roll = this.random();
		const corner = this.corners[Math.floor(this.random() * this.corners.length)];
		if (roll < 0.07) return { kind: 'offTrack', corner };
		if (roll < 0.17) return { kind: 'lockup', corner };
		if (roll < 0.25) return { kind: 'wide', corner };
		return null;
	}

	/** End of the corner on the same unwrapped axis as its start. */
	private span(corner: TCorner): number {
		return corner.end >= corner.start ? corner.end : corner.end + this.trackLength;
	}

	private wrap(d: number): number {
		const n = this.trackLength;
		return ((Math.round(d) % n) + n) % n;
	}
}
