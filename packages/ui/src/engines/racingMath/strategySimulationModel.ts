import type { TDegradationState } from './tyreDegradationModel';

/*
 * Monte Carlo pit stop simulation for the rest of the race.
 *
 * One run draws the things we are unsure about and plays every remaining lap for every
 * possible stop lap with the same draws (common random numbers), so the comparison between
 * stop laps is not drowned by noise:
 *   - pace p and degradation rate d from the Kalman estimate N([p, d], P), d clamped at 0;
 *   - lap noise ε_j ~ N(0, σ²) for each lap j;
 *   - safety cars: each green lap starts one with probability λ; it lasts 2–4 laps.
 *
 * Lap j (1 = the next lap) on the old tyres, current age a: p + d·j + ε_j.
 * After a stop at the end of lap k, lap j runs on new tyres of age j − k:
 *   p + d·(j − k − a) + ε_j, plus the warm-up loss on lap k + 1.
 * Safety car laps cost the same whatever the tyres. A stop costs the pit loss, or
 * `SC_PIT_FACTOR` of it under a safety car since the field is slow anyway.
 * Fuel burn is the same for every stop lap, so it cancels out and is left out.
 */

/** Share of the pit loss paid when stopping under a safety car. */
export const SC_PIT_FACTOR = 0.5;
export const SC_MIN_LAPS = 2;
export const SC_MAX_LAPS = 4;
/** A safety car lap is this much slower than racing pace; the same for every strategy. */
const SC_LAP_FACTOR = 1.4;
export const SIMULATION_RUNS = 1000;

export interface TStrategyInput {
	state: TDegradationState;
	/** Lap-to-lap noise, s. */
	noiseS: number;
	/** Laps left after the current one. */
	lapsRemaining: number;
	pitLossS: number;
	warmUpLossS: number;
	/** Chance a safety car starts on any green lap, 0..1. */
	safetyCarChance: number;
	runs?: number;
	seed?: number;
}

export interface TStopOption {
	/** Laps from now until the stop (stop at the end of that lap); `lapsRemaining` = no stop. */
	stopIn: number;
	isNoStop: boolean;
	/** Mean race time against the best option, s. */
	meanS: number;
	/** 10th and 90th percentile of the race time against the best option in the same run, s. */
	p10S: number;
	p90S: number;
	/** Share of runs where this option was the fastest. */
	bestShare: number;
}

export interface TStrategyResult {
	options: TStopOption[];
	best: TStopOption;
	/** The no-stop option, when the race is short enough to consider it. */
	noStop: TStopOption | null;
	runs: number;
	/** Share of runs that saw at least one safety car. */
	safetyCarShare: number;
}

/** Small seeded generator (mulberry32) so the same inputs give the same answer. */
export const createRandom = (seed: number): (() => number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** Standard normal sample by Box–Muller. */
export const createNormal =
	(random: () => number): (() => number) =>
	() => {
		const u = Math.max(random(), 1e-12);
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
	};

const percentile = (sorted: Float64Array, q: number): number => {
	const position = (sorted.length - 1) * q;
	const low = Math.floor(position);
	const high = Math.ceil(position);
	return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

export const simulateStrategy = (input: TStrategyInput): TStrategyResult | null => {
	const laps = Math.floor(input.lapsRemaining);
	if (laps < 2) {
		return null;
	}
	const runs = input.runs ?? SIMULATION_RUNS;
	const random = createRandom(input.seed ?? 1);
	const normal = createNormal(random);
	const { paceS, rateS, covariance, tyreAge } = input.state;
	// Cholesky factor of the [pace, rate] covariance.
	const l00 = Math.sqrt(Math.max(0, covariance[0]));
	const l10 = l00 > 0 ? covariance[1] / l00 : 0;
	const l11 = Math.sqrt(Math.max(0, covariance[2] - l10 * l10));

	// Options: stop at the end of lap 1..laps−1, or never.
	const optionCount = laps;
	const totals = Array.from({ length: optionCount }, () => new Float64Array(runs));
	const wins = new Float64Array(optionCount);
	let runsWithSafetyCar = 0;
	const lapTime = new Float64Array(laps + 1);
	const isSafetyCar = new Uint8Array(laps + 1);

	for (let run = 0; run < runs; run += 1) {
		const z0 = normal();
		const z1 = normal();
		const pace = paceS + l00 * z0;
		const rate = Math.max(0, rateS + l10 * z0 + l11 * z1);

		isSafetyCar.fill(0);
		let hadSafetyCar = false;
		for (let j = 1; j <= laps; j += 1) {
			if (!isSafetyCar[j] && random() < input.safetyCarChance) {
				const length = SC_MIN_LAPS + Math.floor(random() * (SC_MAX_LAPS - SC_MIN_LAPS + 1));
				for (let s = j; s < j + length && s <= laps; s += 1) isSafetyCar[s] = 1;
				hadSafetyCar = true;
			}
			lapTime[j] = input.noiseS * normal();
		}
		if (hadSafetyCar) runsWithSafetyCar += 1;

		let bestTotal = Infinity;
		let bestOption = 0;
		for (let option = 0; option < optionCount; option += 1) {
			const stopIn = option + 1;
			const isNoStop = stopIn >= laps;
			let total = 0;
			for (let j = 1; j <= laps; j += 1) {
				if (isSafetyCar[j]) {
					total += pace * SC_LAP_FACTOR;
					continue;
				}
				const onNewTyres = !isNoStop && j > stopIn;
				total += onNewTyres
					? pace + rate * (j - stopIn - tyreAge) + lapTime[j]
					: pace + rate * j + lapTime[j];
				if (onNewTyres && j === stopIn + 1) total += input.warmUpLossS;
			}
			if (!isNoStop) {
				total += input.pitLossS * (isSafetyCar[stopIn] ? SC_PIT_FACTOR : 1);
			}
			totals[option][run] = total;
			if (total < bestTotal) {
				bestTotal = total;
				bestOption = option;
			}
		}
		wins[bestOption] += 1;
	}

	const means = totals.map(values => values.reduce((sum, value) => sum + value, 0) / runs);
	const bestIndex = means.reduce((acc, mean, i) => (mean < means[acc] ? i : acc), 0);
	const bestTotals = totals[bestIndex];
	// Spread of each option against the best one in the same run: the safety cars and lap
	// noise both options share cancel, what is left is the risk of choosing it.
	const options: TStopOption[] = totals.map((values, option) => {
		const sorted = values.map((value, run) => value - bestTotals[run]).sort();
		return {
			stopIn: option + 1,
			isNoStop: option + 1 >= laps,
			meanS: means[option] - means[bestIndex],
			p10S: percentile(sorted, 0.1),
			p90S: percentile(sorted, 0.9),
			bestShare: wins[option] / runs,
		};
	});
	const best = options[bestIndex];
	return {
		options,
		best,
		noStop: options.find(option => option.isNoStop) ?? null,
		runs,
		safetyCarShare: runsWithSafetyCar / runs,
	};
};
