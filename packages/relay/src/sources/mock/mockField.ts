import { TFieldEntry } from '@racing/shared';

import { TCompound } from './mockCar';
import { sampleAt } from './mockTrack';

interface TRivalSpec {
	id: string;
	name: string;
	/** Lap time against a perfect lap on fresh tyres. */
	pace: number;
	compound: TCompound;
	/** Stop after this share of the race; null = no stop. */
	stopAt: number | null;
	nextCompound: TCompound;
}

/** A field with different strategies, so the pit window has someone to undercut. */
const RIVALS: TRivalSpec[] = [
	{
		id: 'r-1',
		name: 'A. Kovalenko',
		pace: 1.012,
		compound: 'Medium',
		stopAt: 0.55,
		nextCompound: 'Soft',
	},
	{
		id: 'r-2',
		name: 'L. Moreau',
		pace: 1.016,
		compound: 'Soft',
		stopAt: 0.35,
		nextCompound: 'Medium',
	},
	{
		id: 'r-3',
		name: 'J. Hartley',
		pace: 1.019,
		compound: 'Medium',
		stopAt: 0.45,
		nextCompound: 'Medium',
	},
	{
		id: 'r-4',
		name: 'K. Tanaka',
		pace: 1.023,
		compound: 'Hard',
		stopAt: 0.7,
		nextCompound: 'Soft',
	},
	{
		id: 'r-5',
		name: 'R. Silva',
		pace: 1.027,
		compound: 'Medium',
		stopAt: 0.5,
		nextCompound: 'Soft',
	},
	{
		id: 'r-6',
		name: 'M. Becker',
		pace: 1.03,
		compound: 'Soft',
		stopAt: 0.3,
		nextCompound: 'Hard',
	},
	{
		id: 'r-7',
		name: 'D. Novak',
		pace: 1.034,
		compound: 'Hard',
		stopAt: null,
		nextCompound: 'Hard',
	},
	{
		id: 'r-8',
		name: 'P. Rossi',
		pace: 1.038,
		compound: 'Medium',
		stopAt: 0.6,
		nextCompound: 'Medium',
	},
	{
		id: 'r-9',
		name: 'S. Lindqvist',
		pace: 1.043,
		compound: 'Hard',
		stopAt: 0.65,
		nextCompound: 'Medium',
	},
];

/** Lap time lost per lap of tyre age, share of the lap. */
const DEGRADATION: Record<TCompound, number> = { Soft: 0.0022, Medium: 0.0013, Hard: 0.0008 };
/** Fresh tyres are this much faster than the medium, share of the lap. */
const COMPOUND_PACE: Record<TCompound, number> = { Soft: -0.006, Medium: 0, Hard: 0.006 };
/** Time stood in the box (tyres and fuel), s. The pit lane limiter adds the rest. */
const STOP_S = 24;
const PIT_LANE_KMH = 60;

interface TRival extends TRivalSpec {
	distance: number;
	tyreAge: number;
	pitLap: number | null;
	hasStopped: boolean;
	/** Session time, ms, the car leaves the box. */
	stoppedUntil: number;
	/** Lap-to-lap pace noise. */
	form: number;
}

export interface TFieldCar {
	id: string;
	name: string;
	distance: number;
	compound: string;
	tyreAge: number;
	isPlayer: boolean;
}

/**
 * The rivals: each laps at its own pace on the same speed profile, loses time as its tyres
 * age, and makes its stop on its own lap through the same pit lane as the player.
 */
export class DemoField {
	private readonly rivals: TRival[];

	constructor(
		private readonly profile: Float32Array,
		private readonly trackLength: number,
		private readonly pitLane: { entry: number; box: number; exit: number },
		raceLaps: number,
		gridSpacing: number,
		playerSlot: number,
		private readonly random: () => number,
	) {
		this.rivals = RIVALS.map((spec, i) => {
			const slot = i < playerSlot ? i : i + 1;
			return {
				...spec,
				distance: trackLength - slot * gridSpacing,
				tyreAge: 0,
				pitLap:
					spec.stopAt === null
						? null
						: Math.max(2, Math.min(raceLaps - 1, Math.round(raceLaps * spec.stopAt))),
				hasStopped: false,
				stoppedUntil: 0,
				form: 1,
			};
		});
	}

	advance(dt: number, t: number): void {
		const n = this.trackLength;
		this.rivals.forEach(rival => {
			if (t < rival.stoppedUntil) return;
			const lap = Math.floor(rival.distance / n);
			const d = rival.distance - lap * n;
			const isInLane =
				rival.pitLap !== null &&
				((lap === rival.pitLap && d >= this.pitLane.entry) ||
					(lap === rival.pitLap + 1 && d < this.pitLane.exit && rival.hasStopped));
			const slowdown =
				rival.pace *
				rival.form *
				(1 + COMPOUND_PACE[rival.compound] + DEGRADATION[rival.compound] * rival.tyreAge);
			let speed = sampleAt(this.profile, rival.distance) / slowdown;
			if (isInLane) speed = Math.min(speed, PIT_LANE_KMH / 3.6);
			// Standing start: nobody leaves the grid at racing speed.
			speed = Math.min(speed, 1 + (t / 1000) * 8.5);
			const next = rival.distance + speed * dt;
			const isAtBox =
				isInLane &&
				!rival.hasStopped &&
				lap === rival.pitLap &&
				d < this.pitLane.box &&
				next - lap * n >= this.pitLane.box;
			if (isAtBox) {
				rival.distance = lap * n + this.pitLane.box;
				rival.hasStopped = true;
				rival.stoppedUntil = t + STOP_S * 1000;
				rival.compound = rival.nextCompound;
				rival.tyreAge = 0;
				return;
			}
			if (Math.floor(next / n) > lap) {
				rival.tyreAge += 1;
				rival.form = 1 + (this.random() - 0.5) * 0.006;
			}
			rival.distance = next;
		});
	}

	cars(): TFieldCar[] {
		return this.rivals.map(rival => ({
			id: rival.id,
			name: rival.name,
			distance: rival.distance,
			compound: rival.compound,
			tyreAge: rival.tyreAge,
			isPlayer: false,
		}));
	}

	/** Positions and gaps; gaps are distance over the average race speed. */
	entries(player: TFieldCar, averageSpeed: number): TFieldEntry[] {
		const cars = [...this.cars(), player].sort((a, b) => b.distance - a.distance);
		const leader = cars[0].distance;
		return cars.map((car, index) => ({
			id: car.id,
			name: car.name,
			position: index + 1,
			lap: Math.max(1, Math.floor(car.distance / this.trackLength) + 1),
			gapToLeaderS: index === 0 ? null : (leader - car.distance) / averageSpeed,
			intervalS:
				index === 0 ? null : (cars[index - 1].distance - car.distance) / averageSpeed,
			compound: car.compound,
			tyreAgeLaps: car.tyreAge,
			isPlayer: car.isPlayer,
		}));
	}

	/** Race position of a car `distance` metres into the race. */
	positionOf(distance: number): number {
		return this.rivals.filter(rival => rival.distance > distance).length + 1;
	}
}
