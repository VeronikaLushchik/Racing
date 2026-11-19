import { TTyreZones, TWheelTuple } from '@racing/shared';

import { BASE_MU, TCarLimits } from './mockTrack';

export type TCompound = 'Soft' | 'Medium' | 'Hard';

interface TCompoundTraits {
	/** Grip against a medium. */
	grip: number;
	/** Wear rate against a medium. */
	wear: number;
	/** Running temperature against a medium. */
	heat: number;
}

export const COMPOUNDS: Record<TCompound, TCompoundTraits> = {
	Soft: { grip: 1.025, wear: 1.45, heat: 1.08 },
	Medium: { grip: 1, wear: 1, heat: 1 },
	Hard: { grip: 0.975, wear: 0.65, heat: 0.93 },
};

/** Litres of fuel the car burns per metre at full throttle. */
const BURN_PER_M = 0.00092;
/** Fuel mass per litre over car mass, so a full tank costs about 0.03 s per litre. */
const FUEL_MASS_SHARE = 0.74 / 1300;
/** Temperature of fresh tyres fitted in the pits (no blankets in GT3 sprint races), °C. */
export const FRESH_TYRE_C = 48;
/** Best grip around this tyre temperature, °C. */
const OPTIMAL_TYRE_C = 90;

/** Everything about the car's condition the demo keeps between frames. */
export interface TCarState {
	compound: TCompound;
	tyreTemps: number[];
	/** Smoothed load of each tyre, for the tread zones. */
	tyreLoads: number[];
	brakeTemps: number[];
	tyreWear: number[];
	fuel: number;
	waterTemp: number;
	oilTemp: number;
}

/** What the car does this frame; the inputs of the condition model. */
export interface TCarInput {
	dt: number;
	/** Metres driven this frame. */
	ds: number;
	speed: number;
	gLat: number;
	gLong: number;
	throttle: number;
	brake: number;
	/** Wheel slip of each wheel, share of road speed (negative = locking). */
	slip: number[];
	/** Air and track temperature now, °C. */
	airC: number;
	trackC: number;
}

const approach = (current: number, target: number, tau: number, dt: number): number =>
	current + (target - current) * Math.min(1, dt / tau);

export const createCar = (compound: TCompound, fuel: number, ambientC: number): TCarState => ({
	compound,
	tyreTemps: [0, 1, 2, 3].map(() => FRESH_TYRE_C),
	tyreLoads: [0, 0, 0, 0],
	brakeTemps: [0, 1, 2, 3].map(() => ambientC + 60),
	tyreWear: [0, 0, 0, 0],
	fuel,
	waterTemp: 78,
	oilTemp: 85,
});

/** Fits new tyres and fills the tank to `fuel` litres. */
export const pitService = (car: TCarState, compound: TCompound, fuel: number): void => {
	car.compound = compound;
	car.tyreTemps = car.tyreTemps.map(() => FRESH_TYRE_C);
	car.tyreWear = [0, 0, 0, 0];
	car.fuel = fuel;
};

/**
 * Updates tyres, brakes, fuel and engine for one frame. Tyres heat with the load they carry
 * (the outside wheels in a corner, the fronts under braking, the rears on the throttle) and
 * with slip; they run hotter as the tread wears thin, so temperatures creep up over a stint.
 * Wear follows the same load, and is faster when a tyre overheats.
 */
export const updateCar = (car: TCarState, input: TCarInput): void => {
	const { dt, ds, gLat, throttle, brake, slip } = input;
	const traits = COMPOUNDS[car.compound];
	const ambient = (input.airC + input.trackC) / 2;
	const isStopped = input.speed < 1;
	for (let w = 0; w < 4; w += 1) {
		const isFront = w < 2;
		const isLeft = w % 2 === 0;
		// Positive lateral G pushes the car's weight onto its left wheels.
		const outside = isLeft ? Math.max(0, gLat) : Math.max(0, -gLat);
		const inside = isLeft ? Math.max(0, -gLat) : Math.max(0, gLat);
		const load = outside + 0.25 * inside;
		car.tyreLoads[w] = approach(car.tyreLoads[w], outside - inside, 2.5, dt);
		const axleWork = isFront ? 0.9 * brake : 0.5 * throttle * Math.max(0, input.gLong * 2);
		const target = isStopped
			? ambient + 12
			: ambient +
				traits.heat * (30 + 24 * load + 12 * axleWork + 0.06 * input.speed) +
				120 * Math.abs(slip[w]) +
				22 * car.tyreWear[w];
		car.tyreTemps[w] = approach(car.tyreTemps[w], target, isStopped ? 90 : 14, dt);

		const overheat = Math.max(0, car.tyreTemps[w] - 102) * 0.05;
		const wearWork = 0.45 + 1.1 * load + (isFront ? 0.5 * brake : 0.4 * throttle);
		car.tyreWear[w] = Math.min(
			1,
			car.tyreWear[w] +
				ds * 5.6e-6 * traits.wear * (wearWork + 8 * Math.abs(slip[w])) * (1 + overheat),
		);

		const brakeHeat = brake * input.speed * (isFront ? 2.9 : 1.8) * (isLeft ? 1.03 : 1);
		const brakeCooling = (car.brakeTemps[w] - input.airC) * (0.01 + 0.0009 * input.speed);
		car.brakeTemps[w] = Math.max(
			input.airC,
			car.brakeTemps[w] + (brakeHeat - brakeCooling) * dt,
		);
	}
	car.fuel = Math.max(0, car.fuel - ds * BURN_PER_M * (0.22 + 0.78 * throttle));
	car.waterTemp = approach(car.waterTemp, (isStopped ? 96 : 84) + 7 * throttle, 45, dt);
	car.oilTemp = approach(car.oilTemp, (isStopped ? 104 : 95) + 14 * throttle, 70, dt);
};

/** Tread zones: camber heats the inside edge, the outside edge heats when the tyre is loaded. */
export const tyreZones = (car: TCarState): TWheelTuple<TTyreZones> =>
	car.tyreTemps.map((temp, w) => {
		const isLeft = w % 2 === 0;
		const camber = w < 2 ? 5 : 3;
		const outsideLoad = Math.max(0, isLeft ? car.tyreLoads[w] : -car.tyreLoads[w]);
		return {
			inner: temp + camber - 2 * outsideLoad,
			middle: temp + 1 + 0.02 * (temp - 60),
			outer: temp - 4 + 9 * outsideLoad,
		};
	}) as TWheelTuple<TTyreZones>;

/** Grip of one tyre from its temperature and wear, 1 = warm and fresh. */
const tyreGrip = (temp: number, wear: number): number => {
	const thermal = 1 - 0.00005 * (temp - OPTIMAL_TYRE_C) ** 2;
	const worn = 1 - 0.1 * wear - 0.2 * Math.max(0, wear - 0.6);
	return Math.max(0.6, thermal) * worn;
};

/**
 * The car's limits for the next lap: compound, tyre condition (the fronts count a bit more,
 * they decide the corner speed) and the track temperature, plus the mass of the fuel.
 */
export const carLimits = (car: TCarState, trackC: number): TCarLimits => {
	const grips = car.tyreTemps.map((temp, w) => tyreGrip(temp, car.tyreWear[w]));
	const tyres = 0.3 * (grips[0] + grips[1]) + 0.2 * (grips[2] + grips[3]);
	const track = 1 - 0.0012 * Math.abs(trackC - 38);
	return {
		mu: BASE_MU * COMPOUNDS[car.compound].grip * tyres * track,
		massFactor: 1 / (1 + car.fuel * FUEL_MASS_SHARE),
	};
};

/** How sure the driver is of the grip: 0 on cold tyres, 1 once they are near the window. */
export const tyreConfidence = (car: TCarState): number => {
	const coldest = Math.min(...car.tyreTemps);
	return Math.max(0, Math.min(1, (coldest - 55) / 25));
};

/** Ride height of each wheel, m: aero squat, pitch, roll, bumps and kerbs. */
export const rideHeights = (
	speed: number,
	gLat: number,
	gLong: number,
	lapDistance: number,
	kerb: number,
): TWheelTuple<number> =>
	[0, 1, 2, 3].map(w => {
		const isFront = w < 2;
		const isLeft = w % 2 === 0;
		const statik = isFront ? 0.066 : 0.08;
		const aero = speed * speed * (isFront ? 3.1e-6 : 2.7e-6);
		const pitch = (isFront ? -gLong : gLong) * (isFront ? 0.007 : 0.004);
		const roll = (isLeft ? gLat : -gLat) * 0.006;
		const bump =
			0.0016 * Math.sin(lapDistance * 0.31 + w) +
			0.001 * Math.sin(lapDistance * 0.087 + 2 * w);
		const kerbHit = (isLeft ? Math.max(0, kerb) : Math.max(0, -kerb)) * 0.007;
		return Math.max(0.018, statik - aero - pitch - roll + bump - kerbHit);
	}) as TWheelTuple<number>;
