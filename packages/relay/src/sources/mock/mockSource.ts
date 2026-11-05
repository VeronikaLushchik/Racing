import {
	TFieldEntry,
	TSourceOptions,
	TTelemetryFrame,
	TTyreZones,
	TWeatherSample,
	TWheelTuple,
} from '@racing/shared';

import { LapTracker } from '../../pipeline/lapTracker';
import { TSourceSink, TTelemetrySource } from '../sourceTypings';
import { buildMockTrack, estimateLapTimeS, sampleAt, TMockTrack } from './mockTrack';

const G = 9.81;
const TICK_HZ = 60;
/** The demo sends a weather reading this often (session clock), ms. */
const WEATHER_EVERY_MS = 20000;

const GEAR_UPSHIFT_KMH = [0, 80, 118, 152, 186, 218, 248];

const OPPONENTS = [
	{ id: 'm-1', name: 'A. Kovalenko', pace: 0.992, compound: 'Medium' },
	{ id: 'm-2', name: 'L. Moreau', pace: 0.995, compound: 'Soft' },
	{ id: 'm-3', name: 'J. Hartley', pace: 0.997, compound: 'Medium' },
	{ id: 'm-4', name: 'K. Tanaka', pace: 0.999, compound: 'Hard' },
	{ id: 'm-5', name: 'R. Silva', pace: 1.003, compound: 'Medium' },
	{ id: 'm-6', name: 'M. Becker', pace: 1.005, compound: 'Soft' },
	{ id: 'm-7', name: 'D. Novak', pace: 1.008, compound: 'Hard' },
	{ id: 'm-8', name: 'P. Rossi', pace: 1.011, compound: 'Medium' },
	{ id: 'm-9', name: 'S. Lindqvist', pace: 1.014, compound: 'Hard' },
];

const PLAYER_GRID_SLOT = 4;
const GRID_SPACING_M = 16;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));
const approach = (current: number, target: number, rate: number, dt: number): number =>
	current + (target - current) * Math.min(1, rate * dt);

export const gearForSpeed = (speedKmh: number): { gear: number; rpm: number } => {
	let gear = 1;
	for (let i = 1; i < GEAR_UPSHIFT_KMH.length; i += 1) {
		if (speedKmh >= GEAR_UPSHIFT_KMH[i]) gear = i + 1;
	}
	const low = GEAR_UPSHIFT_KMH[gear - 1];
	const high = GEAR_UPSHIFT_KMH[gear] ?? 290;
	const ratio = clamp((speedKmh - low) / (high - low), 0, 1);
	return { gear, rpm: Math.round(5200 + ratio * 3600) };
};

interface TMockState {
	t: number;
	distance: number;
	lap: number;
	lapStartT: number;
	prevSpeed: number;
	gLong: number;
	tyreTemps: number[];
	tyreZones: TTyreZones[];
	brakeTemps: number[];
	tyreWear: number[];
	fuel: number;
	lapPace: number;
	opponents: number[];
}

/**
 * Made-up afternoon: the sun keeps heating the asphalt for the first half hour, then a light
 * breeze turns. Smooth on purpose so the weather chart has a trend to show.
 */
export const mockWeatherAt = (t: number): TWeatherSample => {
	const minutes = t / 60000;
	const heating = 1 - Math.exp(-minutes / 15);
	return {
		t: Math.round(t),
		airTempC: Number((24 + 2 * heating).toFixed(1)),
		trackTempC: Number((33 + 9 * heating).toFixed(1)),
		humidity: Math.round(48 - 6 * heating),
		pressureHpa: 1013,
		isRaining: false,
		windSpeedMs: Number((2.5 + Math.sin(minutes / 4)).toFixed(1)),
		windDirectionDeg: Math.round((220 + minutes * 3) % 360),
	};
};

/**
 * Synthetic data source: a fictional circuit driven with a physically plausible speed profile,
 * plus a field of opponents for strategy features. Works without any game.
 */
export class MockSource implements TTelemetrySource {
	private readonly track: TMockTrack = buildMockTrack();
	private readonly baseLapS = estimateLapTimeS(this.track);
	private readonly lapTracker = new LapTracker(this.track.length);
	private readonly rate: number;
	private timer: NodeJS.Timeout | null = null;
	private ticks = 0;
	private lastWeatherT = 0;
	private state: TMockState;

	constructor(
		private readonly sink: TSourceSink,
		options: TSourceOptions,
	) {
		this.rate = clamp(options.rate ?? 1, 0.25, 8);
		this.state = this.initialState();
	}

	async start(): Promise<void> {
		this.sink.session({
			sessionId: `mock-${Date.now()}`,
			source: 'mock',
			title: 'Demo circuit (synthetic)',
			track: 'Demo circuit',
			driver: 'You',
			trackLength: this.track.length,
			capabilities: {
				isLive: true,
				hasSteering: true,
				hasTyreTemps: true,
				hasTyreZones: true,
				hasBrakeTemps: true,
				hasTyreWear: true,
				hasFuel: true,
				hasSectors: true,
				hasOpponents: true,
				hasMeasuredG: true,
				hasWheelSpeeds: true,
				hasSuspension: true,
				hasEngineTemps: true,
				hasWeather: true,
			},
		});
		this.sink.status('streaming', null);
		this.sink.weather(mockWeatherAt(0));
		this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** Exposed for tests: advances the simulation by one tick and returns the frame. */
	step(dt: number): TTelemetryFrame {
		const s = this.state;
		const length = this.track.length;
		const ideal = sampleAt(this.track.speed, s.distance);
		const wearPenalty = 1 - 0.06 * Math.max(...s.tyreWear);
		const speed = ideal * s.lapPace * wearPenalty;

		s.t += dt * 1000;
		s.distance += speed * dt;
		const accel = (speed - s.prevSpeed) / dt;
		s.prevSpeed = speed;
		s.gLong = approach(s.gLong, accel / G, 20, dt);

		const curvature = sampleAt(this.track.curvature, s.distance);
		const gLat = (-speed * speed * curvature) / G;
		const speedKmh = speed * 3.6;
		const isBraking = accel < -2;
		const isFlatOut = speed > ideal * 0.985 && accel >= -0.2 && Math.abs(curvature) < 0.002;
		const brake = isBraking ? clamp(-accel / (2.6 * G), 0.05, 1) : 0;
		const throttle = isBraking
			? 0
			: isFlatOut || accel > 0.5
				? clamp(0.7 + accel / 10, 0.7, 1)
				: 0.35;

		// Starts behind the line on lap 0; the first crossing begins lap 1.
		const lap = Math.floor(s.distance / length);
		if (lap !== s.lap) this.onNewLap(lap);

		this.updateThermals(dt, gLat, brake, speed);
		s.fuel = Math.max(0, s.fuel - (speed * dt * 2.3) / length);
		for (let i = 0; i < 4; i += 1) {
			s.tyreWear[i] = Math.min(1, s.tyreWear[i] + speed * dt * 1.6e-6 * (1 + Math.abs(gLat)));
		}

		const { gear, rpm } = gearForSpeed(speedKmh);
		const index = Math.floor(s.distance % length);

		return {
			t: Math.round(s.t),
			lap: s.lap,
			lapTimeMs: Math.round(s.t - s.lapStartT),
			lapDistance: s.distance % length,
			speed: speedKmh,
			rpm,
			gear,
			throttle,
			brake,
			// A little understeer above 0.8 G so the setup advisor has something to find.
			steer: clamp(
				(-curvature / 0.03) * (1 + 0.35 * Math.max(0, Math.abs(gLat) - 0.8)),
				-1,
				1,
			),
			gLat,
			gLong: s.gLong,
			x: this.track.x[index],
			z: this.track.z[index],
			tyreTemps: s.tyreTemps.slice() as TWheelTuple<number>,
			tyreZones: s.tyreZones.map(zone => ({ ...zone })) as TWheelTuple<TTyreZones>,
			brakeTemps: s.brakeTemps.slice() as TWheelTuple<number>,
			tyreWear: s.tyreWear.slice() as TWheelTuple<number>,
			fuel: s.fuel,
			position: this.playerPosition(),
			wheelSpeeds: this.wheelSpeeds(speedKmh, brake, throttle, gear),
			suspension: this.suspension(gLat, s.gLong),
			waterTemp: 88 + throttle * 4,
			oilTemp: 102 + throttle * 6,
		};
	}

	/** Fronts lock a little under the hardest braking, rears spin on full throttle in low gears. */
	private wheelSpeeds(
		speedKmh: number,
		brake: number,
		throttle: number,
		gear: number,
	): TWheelTuple<number> {
		const lock = 1 - 0.08 * clamp((brake - 0.85) / 0.15, 0, 1);
		const spin = gear <= 2 ? 1 + 0.06 * clamp((throttle - 0.9) / 0.1, 0, 1) : 1;
		return [speedKmh * lock, speedKmh * lock, speedKmh * spin, speedKmh * spin];
	}

	/** Ride height per wheel from load transfer: braking dives the front, corners roll. */
	private suspension(gLat: number, gLong: number): TWheelTuple<number> {
		return [0, 1, 2, 3].map(i => {
			const isFront = i < 2;
			const isLeft = i % 2 === 0;
			const pitch = (isFront ? -gLong : gLong) * 0.008;
			const roll = (isLeft ? gLat : -gLat) * 0.01;
			return clamp(0.07 - pitch - roll, 0.02, 0.1);
		}) as TWheelTuple<number>;
	}

	private tick(): void {
		const dt = (1 / TICK_HZ) * this.rate;
		const frame = this.step(dt);
		this.advanceOpponents(dt);
		this.sink.frame(frame);
		const lap = this.lapTracker.push(frame);
		if (lap) this.sink.lap({ ...lap, compound: 'Medium' });
		this.ticks += 1;
		if (this.ticks % (TICK_HZ / 2) === 0) this.sink.field(this.buildField());
		if (
			Math.floor(frame.t / WEATHER_EVERY_MS) !==
			Math.floor(this.lastWeatherT / WEATHER_EVERY_MS)
		) {
			this.sink.weather(mockWeatherAt(frame.t));
		}
		this.lastWeatherT = frame.t;
	}

	private initialState(): TMockState {
		const startOffset = -PLAYER_GRID_SLOT * GRID_SPACING_M;
		return {
			t: 0,
			distance: this.track.length + startOffset,
			lap: 0,
			lapStartT: 0,
			prevSpeed: 0,
			gLong: 0,
			tyreTemps: [70, 70, 70, 70],
			tyreZones: [0, 1, 2, 3].map(() => ({ inner: 70, middle: 70, outer: 70 })),
			brakeTemps: [200, 200, 200, 200],
			tyreWear: [0, 0, 0, 0],
			fuel: 60,
			lapPace: 1,
			opponents: OPPONENTS.map((_, i) => {
				const slot = i < PLAYER_GRID_SLOT ? i : i + 1;
				return this.track.length - slot * GRID_SPACING_M;
			}),
		};
	}

	private onNewLap(lap: number): void {
		this.state.lap = lap;
		this.state.lapStartT = this.state.t;
		// Small lap-to-lap variation so lap times and deltas are not identical.
		this.state.lapPace = 0.985 + Math.random() * 0.02;
	}

	private updateThermals(dt: number, gLat: number, brake: number, speed: number): void {
		const s = this.state;
		for (let wheel = 0; wheel < 4; wheel += 1) {
			const isLeft = wheel % 2 === 0;
			const isFront = wheel < 2;
			// Outside wheels in a corner carry more load and heat up.
			const load = isLeft ? Math.max(0, gLat) : Math.max(0, -gLat);
			const target = 78 + 16 * load + (isFront ? 8 * brake : 0) + speed * 0.05;
			s.tyreTemps[wheel] = approach(s.tyreTemps[wheel], target, 0.25, dt);
			const avg = s.tyreTemps[wheel];
			s.tyreZones[wheel] = { inner: avg + 4, middle: avg + 1, outer: avg - 4 + 6 * load };
			const brakeTarget = 250 + (isFront ? 650 : 420) * brake;
			const brakeRate = brake > 0 ? 1.5 : 0.15;
			s.brakeTemps[wheel] = approach(s.brakeTemps[wheel], brakeTarget, brakeRate, dt);
		}
	}

	private advanceOpponents(dt: number): void {
		// Rivals follow the same ideal speed profile, scaled by their pace.
		this.state.opponents = this.state.opponents.map(
			(distance, i) =>
				distance + (sampleAt(this.track.speed, distance) / OPPONENTS[i].pace) * dt,
		);
	}

	private playerPosition(): number {
		const ahead = this.state.opponents.filter(d => d > this.state.distance).length;
		return ahead + 1;
	}

	private buildField(): TFieldEntry[] {
		const avgSpeed = this.track.length / this.baseLapS;
		const cars = [
			...OPPONENTS.map((o, i) => ({
				...o,
				distance: this.state.opponents[i],
				isPlayer: false,
			})),
			{
				id: 'player',
				name: 'You',
				pace: 1,
				compound: 'Medium',
				distance: this.state.distance,
				isPlayer: true,
			},
		].sort((a, b) => b.distance - a.distance);
		const leader = cars[0].distance;

		return cars.map((car, index) => ({
			id: car.id,
			name: car.name,
			position: index + 1,
			lap: Math.max(1, Math.floor(car.distance / this.track.length)),
			gapToLeaderS: index === 0 ? null : (leader - car.distance) / avgSpeed,
			intervalS: index === 0 ? null : (cars[index - 1].distance - car.distance) / avgSpeed,
			compound: car.compound,
			tyreAgeLaps: Math.max(0, Math.floor(car.distance / this.track.length) - 1),
			isPlayer: car.isPlayer,
		}));
	}
}
