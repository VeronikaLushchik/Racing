import { TSourceOptions, TTelemetryFrame, TWheelTuple } from '@racing/shared';

import { LapTracker } from '../../pipeline/lapTracker';
import { TSourceSink, TTelemetrySource } from '../sourceTypings';
import {
	carLimits,
	createCar,
	pitService,
	rideHeights,
	TCarState,
	TCompound,
	tyreConfidence,
	tyreZones,
	updateCar,
} from './mockCar';
import { createRandom, DemoDriver, gaussian, TLapPlan } from './mockDriver';
import { DemoField } from './mockField';
import {
	brakeCapacity,
	buildMockTrack,
	buildSpeedProfile,
	dragAccel,
	engineAccel,
	estimateLapTimeS,
	findCorners,
	gripAccel,
	sampleAt,
	TCarLimits,
	TCorner,
	TMockTrack,
} from './mockTrack';
import { mockWeatherAt } from './mockWeather';

export { mockWeatherAt } from './mockWeather';

const G = 9.81;
const TICK_HZ = 60;
/** The demo sends a weather reading this often (session clock), ms. */
const WEATHER_EVERY_MS = 20000;
/** Field (positions, gaps) update interval, session clock, ms. */
const FIELD_EVERY_MS = 500;

export const DEFAULT_RACE_LAPS = 20;
export const MAX_RACE_LAPS = 60;
export const MOCK_MAX_RATE = 64;

/** Speed in each gear at the 8800 rpm limiter, km/h (six-speed GT3 gearbox). */
const GEAR_TOP_KMH = [100, 136, 170, 203, 236, 272];
const REV_LIMIT = 8800;
const UPSHIFT_RPM = 8450;
const IDLE_RPM = 1600;

const PLAYER_GRID_SLOT = 4;
const GRID_SPACING_M = 16;
/** Pit lane, metres from the line: entry and box on the in-lap, exit on the out-lap. */
const PIT_LANE = { entry: 0, box: 0, exit: 260 };
const PIT_ENTRY_BEFORE_M = 420;
const PIT_BOX_BEFORE_M = 140;
const PIT_LANE_MS = 60 / 3.6;
/** Time the car stands in the box, s. */
const PIT_STOP_S = 24;
/** Sideways offset of the pit lane from the racing line, m. */
const PIT_LANE_OFFSET_M = 16;
/** Litres a lap, to plan the fuel load (the model burns about this much). */
const FUEL_PER_LAP_L = 2.75;

const WHEELBASE_M = 2.7;
/** Road wheel angle at full steering lock, rad. */
const MAX_WHEEL_ANGLE = 0.36;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));
const approach = (current: number, target: number, rate: number, dt: number): number =>
	current + (target - current) * Math.min(1, rate * dt);

/** Gear and engine speed after a frame at `speedKmh`, shifting like a driver would. */
export const shiftGear = (
	speedKmh: number,
	gear: number,
	isBraking: boolean,
): { gear: number; rpm: number } => {
	const rpmIn = (g: number): number => (REV_LIMIT * speedKmh) / GEAR_TOP_KMH[g - 1];
	let next = clamp(gear, 1, GEAR_TOP_KMH.length);
	// Never up a gear on the brakes: the driver holds it and goes down after.
	while (!isBraking && next < GEAR_TOP_KMH.length && rpmIn(next) >= UPSHIFT_RPM) next += 1;
	// Down a gear when the lower one has room: early under braking, late when cruising.
	const downshiftRpm = isBraking ? 7600 : 4200;
	while (next > 1 && rpmIn(next - 1) <= downshiftRpm && rpmIn(next) < downshiftRpm) next -= 1;
	return { gear: next, rpm: Math.round(clamp(rpmIn(next), IDLE_RPM, REV_LIMIT)) };
};

/** Kept for code that wants a gear for a steady speed. */
export const gearForSpeed = (speedKmh: number): { gear: number; rpm: number } =>
	shiftGear(speedKmh, 1, false);

interface TPitPlan {
	lap: number;
	compound: TCompound;
	fuel: number;
}

interface TMockState {
	t: number;
	/** Metres since the start of lap 0 (the grid is behind the line). */
	distance: number;
	speed: number;
	lap: number;
	lapStartT: number;
	gear: number;
	throttle: number;
	brake: number;
	gLong: number;
	steerNoise: number;
	lateral: number;
	plan: TLapPlan;
	profile: Float32Array;
	limits: TCarLimits;
	pitPhase: 'none' | 'stopped' | 'done';
	stoppedUntil: number;
	tyreAgeLaps: number;
	lapCompound: TCompound;
	/** Laps the source has to tell the lap tracker about. */
	invalidLaps: Set<number>;
	pitLaps: Set<number>;
	isFinished: boolean;
}

/**
 * The demo: a GT3 sprint race on a fictional 3.8 km circuit, driven by a believable amateur.
 * A point-mass car with a friction circle, downforce and a power curve gives real trace shapes
 * (trail braking, progressive throttle, gear sawtooth); tyres heat, wear and fade over a stint;
 * fuel burns off; there is one pit stop for fresh softs, nine rivals on their own strategies,
 * weather that changes, the odd lock-up or trip over the kerbs, and a chequered flag at the end
 * so the session report has a finished race to analyse.
 */
export class MockSource implements TTelemetrySource {
	private readonly track: TMockTrack = buildMockTrack();
	private readonly corners: TCorner[] = findCorners(this.track.curvature);
	private readonly baseLapS = estimateLapTimeS(this.track);
	private readonly lapTracker = new LapTracker(this.track.length);
	private readonly random: () => number;
	private readonly driver: DemoDriver;
	private readonly field: DemoField;
	private readonly car: TCarState;
	private readonly raceLaps: number;
	private readonly pit: TPitPlan | null;
	private readonly pitLane = { ...PIT_LANE };
	private rate: number;
	private timer: NodeJS.Timeout | null = null;
	private lastWeatherT = 0;
	private lastFieldT = 0;
	private state: TMockState;

	constructor(
		private readonly sink: TSourceSink,
		options: TSourceOptions,
		seed = Date.now(),
	) {
		this.rate = clamp(options.rate ?? 1, 0.25, MOCK_MAX_RATE);
		this.raceLaps = Math.round(clamp(options.raceLaps ?? DEFAULT_RACE_LAPS, 3, MAX_RACE_LAPS));
		this.random = createRandom(seed);
		const length = this.track.length;
		this.pitLane.entry = length - PIT_ENTRY_BEFORE_M;
		this.pitLane.box = length - PIT_BOX_BEFORE_M;

		const pitLap = clamp(Math.round(this.raceLaps * 0.5), 2, this.raceLaps - 1);
		this.pit =
			this.raceLaps >= 4
				? {
						lap: pitLap,
						compound: 'Soft',
						fuel: (this.raceLaps - pitLap + 0.7) * FUEL_PER_LAP_L + 1,
					}
				: null;
		const startFuel = ((this.pit?.lap ?? this.raceLaps) + 0.8) * FUEL_PER_LAP_L + 1.5;
		this.car = createCar('Medium', startFuel, mockWeatherAt(0).airTempC);
		this.driver = new DemoDriver(this.corners, length, this.random);
		this.field = new DemoField(
			this.track.speed,
			length,
			this.pitLane,
			this.raceLaps,
			GRID_SPACING_M,
			PLAYER_GRID_SLOT,
			this.random,
		);
		this.state = this.initialState();
	}

	/** Changes the simulation speed on the fly; returns the speed applied. */
	setRate(rate: number): number {
		this.rate = clamp(rate, 0.25, MOCK_MAX_RATE);
		return this.rate;
	}

	async start(): Promise<void> {
		this.sink.session({
			sessionId: `mock-${Date.now()}`,
			source: 'mock',
			title: `Demo race · GT3 · ${this.raceLaps} laps`,
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
		this.sink.field(this.fieldEntries());
		this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	get isFinished(): boolean {
		return this.state.isFinished;
	}

	/** Exposed for tests: advances the simulation by one frame and returns it. */
	step(dt: number): TTelemetryFrame {
		const s = this.state;
		const n = this.track.length;
		const limits = s.limits;
		let d = s.distance - s.lap * n;

		// Where the driver wants to be going: the lap profile, or the pit lane limiter.
		const isInLap = this.pit !== null && s.lap === this.pit.lap;
		const isOutLap = this.pit !== null && s.lap === this.pit.lap + 1;
		const isInLane =
			(isInLap && d >= this.pitLane.entry) || (isOutLap && d < this.pitLane.exit);
		let target = sampleAt(s.profile, d);
		if (isInLane) target = Math.min(target, PIT_LANE_MS);
		if (isInLap && s.pitPhase === 'none' && d >= this.pitLane.entry) {
			target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, this.pitLane.box - d)));
		}

		s.t += dt * 1000;
		const previous = s.speed;
		if (s.pitPhase === 'stopped') {
			if (s.t >= s.stoppedUntil) s.pitPhase = 'done';
			s.speed = 0;
		} else {
			const maxAccel =
				Math.min(engineAccel(previous, limits), gripAccel(previous, limits) * 0.62) -
				dragAccel(previous);
			const maxDecel = brakeCapacity(previous, limits) + dragAccel(previous);
			s.speed = Math.max(
				0,
				previous + clamp(target - previous, -maxDecel * dt, Math.max(0.3, maxAccel) * dt),
			);
		}
		const accel = (s.speed - previous) / dt;
		const ds = ((s.speed + previous) / 2) * dt;
		s.distance += ds;
		d += ds;

		if (isInLap && s.pitPhase === 'none' && s.speed < 0.2 && d >= this.pitLane.box - 2) {
			this.startPitStop();
		}

		const lap = Math.floor(s.distance / n);
		if (lap !== s.lap) {
			this.onNewLap(lap);
			d = s.distance - lap * n;
		}

		// Pedals: brake for the deceleration the tyres give, throttle for what the engine must push.
		const drag = dragAccel(s.speed);
		let brakeTarget = 0;
		let throttleTarget = 0;
		if (s.pitPhase === 'stopped') {
			brakeTarget = 0.3;
		} else if (accel < -(drag + 0.6)) {
			brakeTarget = clamp((1.1 * (-accel - drag)) / brakeCapacity(s.speed, limits), 0, 1);
		} else {
			throttleTarget = clamp((accel + drag) / engineAccel(s.speed, limits), 0, 1);
		}
		s.brake = approach(s.brake, brakeTarget, brakeTarget > s.brake ? 28 : 14, dt);
		s.throttle = approach(s.throttle, throttleTarget, 16, dt);
		const throttleJitter =
			s.throttle > 0.05 && s.throttle < 0.95 ? gaussian(this.random, 0.01) : 0;
		const throttle = clamp(s.throttle + throttleJitter, 0, 1);
		const brake = clamp(s.brake < 0.01 ? 0 : s.brake, 0, 1);

		// Sideways: the pit lane and trips off the track move the car off the racing line.
		const mistake = s.plan.mistake;
		let lateralTarget = 0;
		let roughness = 0;
		if (isInLane) {
			const fromEntry = isInLap ? d - this.pitLane.entry : Infinity;
			const toExit = isOutLap ? this.pitLane.exit - d : Infinity;
			lateralTarget = PIT_LANE_OFFSET_M * clamp(Math.min(fromEntry, toExit) / 80, 0, 1);
		} else if (mistake?.kind === 'offTrack' || mistake?.kind === 'wide') {
			const from = this.unwrapAfter(mistake.corner.apex, d);
			if (from >= 0 && from < 110) {
				const depth = mistake.kind === 'offTrack' ? 7 : 3;
				lateralTarget =
					-mistake.corner.direction * depth * Math.sin((Math.PI * from) / 110);
				roughness = mistake.kind === 'offTrack' ? 1 : 0.4;
				if (mistake.kind === 'offTrack' && from > 20) s.invalidLaps.add(s.lap);
			}
		}
		s.lateral = approach(s.lateral, lateralTarget, 3, dt);

		const curvature = sampleAt(this.track.curvature, d);
		const speedMs = s.speed;
		const bumpG = 0.025 * Math.sin(d * 0.9) + roughness * gaussian(this.random, 0.12);
		const gLat = (-speedMs * speedMs * curvature) / G + gaussian(this.random, 0.015) + bumpG;
		s.gLong = approach(s.gLong, accel / G, 18, dt);
		const gLong =
			s.gLong + gaussian(this.random, 0.01) + roughness * gaussian(this.random, 0.08);

		// Wheel slip: light under braking, a lock-up when the driver dives too deep, wheelspin
		// out of slow corners that gets worse as the rears wear.
		const rearWear = (this.car.tyreWear[2] + this.car.tyreWear[3]) / 2;
		let frontSlip = -0.012 * brake;
		if (mistake?.kind === 'lockup' && brake > 0.6) {
			const toCorner = this.unwrapAfter(d, mistake.corner.start);
			if (toCorner >= 0 && toCorner < 90) frontSlip = -0.11 - 0.06 * brake;
		}
		let rearSlip = 0.006 * throttle;
		if (throttle > 0.6 && s.gear <= 2 && Math.abs(gLat) > 0.4 && s.speed > 12) {
			rearSlip = 0.015 + 0.06 * clamp((throttle - 0.8) / 0.2, 0, 1) * (1 + 1.5 * rearWear);
		}
		const isLeftTurn = curvature > 0;
		const slip = [
			frontSlip * (isLeftTurn ? 1.15 : 0.9),
			frontSlip * (isLeftTurn ? 0.9 : 1.15),
			rearSlip,
			rearSlip,
		];

		// Steering: geometry of the corner plus understeer that grows under braking and as the
		// fronts wear; a touch of power oversteer on exits.
		const frontWear = (this.car.tyreWear[0] + this.car.tyreWear[1]) / 2;
		const latG = Math.abs(gLat);
		let gradient = 0.0045 + 0.007 * brake + 0.006 * frontWear;
		if (throttle > 0.7 && latG > 0.6) gradient -= 0.004 * (1 + 2 * rearWear);
		s.steerNoise = approach(s.steerNoise, gaussian(this.random, 0.01), 6, dt);
		const wheelAngle = WHEELBASE_M * curvature + Math.sign(curvature) * gradient * latG;
		const steer = clamp(
			-wheelAngle / MAX_WHEEL_ANGLE + s.steerNoise * (s.speed > 5 ? 1 : 0),
			-1,
			1,
		);

		const weather = mockWeatherAt(s.t);
		updateCar(this.car, {
			dt,
			ds,
			speed: s.speed,
			gLat,
			gLong,
			throttle,
			brake,
			slip,
			airC: weather.airTempC,
			trackC: weather.trackTempC,
		});

		const speedKmh = s.speed * 3.6;
		const shifted = shiftGear(speedKmh, s.gear, brake > 0.1);
		s.gear = shifted.gear;

		const index = Math.floor(d) % n;
		const ahead = (index + 1) % n;
		const dx = this.track.x[ahead] - this.track.x[index];
		const dz = this.track.z[ahead] - this.track.z[index];
		const norm = Math.hypot(dx, dz) || 1;
		const kerb = this.kerbAt(d) + roughness * gaussian(this.random, 0.5);

		return {
			t: Math.round(s.t),
			lap: s.lap,
			lapTimeMs: Math.round(s.t - s.lapStartT),
			lapDistance: d,
			speed: speedKmh,
			rpm: s.speed < 0.5 ? IDLE_RPM : shifted.rpm,
			gear: s.gear,
			throttle,
			brake,
			steer,
			gLat,
			gLong,
			x: this.track.x[index] + (-dz / norm) * s.lateral,
			z: this.track.z[index] + (dx / norm) * s.lateral,
			tyreTemps: this.car.tyreTemps.slice() as TWheelTuple<number>,
			tyreZones: tyreZones(this.car),
			brakeTemps: this.car.brakeTemps.slice() as TWheelTuple<number>,
			tyreWear: this.car.tyreWear.slice() as TWheelTuple<number>,
			fuel: this.car.fuel,
			position: this.field.positionOf(s.distance),
			wheelSpeeds: slip.map(value => speedKmh * (1 + value)) as TWheelTuple<number>,
			suspension: rideHeights(s.speed, gLat, gLong, d, kerb),
			waterTemp: this.car.waterTemp,
			oilTemp: this.car.oilTemp,
		};
	}

	private tick(): void {
		const steps = Math.max(1, Math.round(this.rate));
		const dt = this.rate / steps / TICK_HZ;
		for (let i = 0; i < steps && !this.state.isFinished; i += 1) this.advance(dt);
		if (this.state.isFinished) {
			this.stop();
			const position = this.field.positionOf(this.state.distance);
			this.sink.status('idle', `Chequered flag: P${position} after ${this.raceLaps} laps.`);
		}
	}

	/** One frame of the race: the player, the rivals, laps, field and weather. */
	private advance(dt: number): void {
		const frame = this.step(dt);
		this.field.advance(dt, frame.t);
		this.sink.frame(frame);
		if (this.state.invalidLaps.has(frame.lap)) this.lapTracker.markInvalid();
		if (this.state.pitLaps.has(frame.lap)) this.lapTracker.markPit();
		const lap = this.lapTracker.push(frame);
		if (lap) {
			this.sink.lap({ ...lap, compound: this.state.lapCompound });
			this.state.lapCompound = this.car.compound;
		}
		if (frame.t - this.lastFieldT >= FIELD_EVERY_MS) {
			this.lastFieldT = frame.t;
			this.sink.field(this.fieldEntries());
		}
		if (
			Math.floor(frame.t / WEATHER_EVERY_MS) !==
			Math.floor(this.lastWeatherT / WEATHER_EVERY_MS)
		) {
			this.sink.weather(mockWeatherAt(frame.t));
		}
		this.lastWeatherT = frame.t;
		if (frame.lap > this.raceLaps) this.state.isFinished = true;
	}

	private fieldEntries() {
		return this.field.entries(
			{
				id: 'player',
				name: 'You',
				distance: this.state.distance,
				compound: this.car.compound,
				tyreAge: this.state.tyreAgeLaps,
				isPlayer: true,
			},
			this.track.length / (this.baseLapS * 1.03),
		);
	}

	private initialState(): TMockState {
		const limits = carLimits(this.car, mockWeatherAt(0).trackTempC);
		const plan = this.driver.planLap(0, 0);
		return {
			t: 0,
			distance: this.track.length - PLAYER_GRID_SLOT * GRID_SPACING_M,
			speed: 0,
			lap: 0,
			lapStartT: 0,
			gear: 1,
			throttle: 0,
			brake: 0,
			gLong: 0,
			steerNoise: 0,
			lateral: 0,
			plan,
			profile: buildSpeedProfile(this.track.curvature, limits, plan),
			limits,
			pitPhase: 'none',
			stoppedUntil: 0,
			tyreAgeLaps: 0,
			lapCompound: this.car.compound,
			invalidLaps: new Set(),
			pitLaps: new Set(),
			isFinished: false,
		};
	}

	private startPitStop(): void {
		const s = this.state;
		if (!this.pit) return;
		s.pitPhase = 'stopped';
		s.stoppedUntil = s.t + PIT_STOP_S * 1000;
		s.pitLaps.add(s.lap);
		pitService(this.car, this.pit.compound, this.pit.fuel);
		s.tyreAgeLaps = 0;
	}

	private onNewLap(lap: number): void {
		const s = this.state;
		s.lap = lap;
		s.lapStartT = s.t;
		if (lap > 1) s.tyreAgeLaps += 1;
		const trackC = mockWeatherAt(s.t).trackTempC;
		s.limits = carLimits(this.car, trackC);
		s.plan = this.driver.planLap(lap, tyreConfidence(this.car));
		s.profile = buildSpeedProfile(this.track.curvature, s.limits, s.plan);
	}

	/** Kerb strike at the apex of each corner: +1 under the left wheels, -1 under the right. */
	private kerbAt(d: number): number {
		const corner = this.corners.find(c => Math.abs(this.unwrapAfter(c.apex, d)) < 5);
		return corner ? corner.direction : 0;
	}

	/** Metres from `from` forward to `to` on the loop, in -n/2..n/2. */
	private unwrapAfter(from: number, to: number): number {
		const n = this.track.length;
		let delta = (to - from) % n;
		if (delta > n / 2) delta -= n;
		if (delta < -n / 2) delta += n;
		return delta;
	}
}
