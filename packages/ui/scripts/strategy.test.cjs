const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src/engines/racingMath';
const { fitLine, modelDegradation, currentStint, FUEL_EFFECT_S_PER_L } = require(
	`${base}/tyreDegradationModel`,
);
const { predictRejoin, undercutGain, undercutTarget } = require(`${base}/pitWindowModel`);

const record = (lap, lapTimeS, extra = {}) => ({
	lap,
	lapTimeMs: lapTimeS * 1000,
	sectorsMs: [],
	isValid: true,
	isPitLap: false,
	compound: null,
	step: 2,
	distance: new Float32Array(0),
	channels: {},
	tyreTempAvg: null,
	tyreWearEnd: null,
	fuelStart: null,
	fuelEnd: null,
	...extra,
});

const options = { horizon: 3, temperatureWindow: { min: 80, max: 105 }, wearLimit: 0.7 };

test('least squares recovers a straight line', () => {
	const fit = fitLine([1, 2, 3, 4], [10, 12, 14, 16]);
	assert.equal(fit.slope, 2);
	assert.equal(fit.intercept, 8);
	assert.equal(fit.sigma, 0);
});

test('the stint starts after the last pit lap', () => {
	const stint = currentStint([record(1, 90), record(2, 110, { isPitLap: true }), record(3, 91)]);
	assert.deepEqual(
		stint.map(item => [item.lap.lap, item.tyreAge]),
		[[3, 1]],
	);
});

test('degradation needs three clean laps and skips the first lap of the stint', () => {
	const laps = [record(1, 95), record(2, 90.2), record(3, 90.4)];
	assert.equal(modelDegradation(laps, options), null);
	laps.push(record(4, 99, { isValid: false }));
	assert.equal(modelDegradation(laps, options), null);
	laps.push(record(5, 90.8));
	const result = modelDegradation(laps, options);
	// Three laps and a wide prior: the filter lands close to the 0.2 s/lap of the data.
	assert.ok(Math.abs(result.degradationS - 0.2) < 0.02, result.degradationS);
	result.forecast.forEach((lap, i) => {
		assert.equal(lap.lap, 6 + i);
		assert.ok(Math.abs(lap.lapTimeS - (91 + 0.2 * i)) < 0.1, lap.lapTimeS);
		assert.ok(lap.high - lap.low > 0);
	});
	// The band widens the further ahead it looks.
	const widths = result.forecast.map(lap => lap.high - lap.low);
	assert.ok(widths[2] > widths[0]);
});

test('fuel burn is taken out before fitting, so a lighter car does not hide wear', () => {
	// Raw lap times stay flat: 0.3 s/lap of wear is cancelled by 10 L/lap less fuel.
	const laps = [1, 2, 3, 4, 5].map(lap =>
		record(lap, 90, { fuelStart: 100 - (lap - 1) * 10, fuelEnd: 90 - (lap - 1) * 10 }),
	);
	const result = modelDegradation(laps, options);
	assert.ok(Math.abs(result.degradationS - 10 * FUEL_EFFECT_S_PER_L) < 0.02, result.degradationS);
	assert.equal(result.fuelPerLapL, 10);
});

test('tyre temperature trend gives laps until the window is left', () => {
	const laps = [1, 2, 3, 4].map(lap =>
		record(lap, 90 + lap * 0.1, { tyreTempAvg: [95 + lap * 2, 90, 90, 110] }),
	);
	const [fl, fr, , rr] = modelDegradation(laps, options).temperature;
	assert.equal(fl.slope, 2);
	assert.equal(fl.lapsLeft, (105 - 103) / 2);
	assert.equal(fr.lapsLeft, null);
	assert.equal(rr.lapsLeft, 0);
});

const car = (id, position, gap, isPlayer = false) => ({
	id,
	name: id,
	position,
	lap: 5,
	gapToLeaderS: position === 1 ? null : gap,
	intervalS: null,
	compound: null,
	tyreAgeLaps: null,
	isPlayer,
});

const field = [
	car('A', 1, 0),
	car('B', 2, 3),
	car('ME', 3, 5, true),
	car('C', 4, 20),
	car('D', 5, 27.5),
	car('E', 6, 40),
];

test('rejoin lands between the cars around gap + pit loss', () => {
	const rejoin = predictRejoin(field, 22);
	assert.equal(rejoin.gapToLeaderS, 27);
	assert.equal(rejoin.position, 4);
	assert.equal(rejoin.ahead.entry.id, 'C');
	assert.equal(rejoin.behind.entry.id, 'D');
	assert.equal(rejoin.behind.gapS, 0.5);
	assert.equal(rejoin.isClearAir, false);
	assert.equal(predictRejoin(field, 10).isClearAir, true);
	assert.equal(predictRejoin([car('A', 1, 0)], 22), null);
});

test('undercut grows with laps the rival stays out', () => {
	assert.ok(Math.abs(undercutGain(0.1, 10, 3, 1).gainS - 2) < 1e-9);
	assert.equal(undercutGain(0.1, 10, 3, 1).laps, 3);
	const target = undercutTarget(field, 0.1, 10, 1);
	assert.equal(target.entry.id, 'B');
	assert.equal(target.intervalS, 2);
	assert.equal(target.lapsNeeded, 3);
	assert.equal(undercutTarget(field, 0, 10).lapsNeeded, null);
});

test('car profiles: F1 data defaults to F1, sims to GT3, and F1 burns less time per litre', () => {
	const { CAR_PROFILES, defaultCarProfileId, isCarProfileId } = require(`${base}/carProfiles`);
	assert.equal(defaultCarProfileId('f1'), 'f1');
	assert.equal(defaultCarProfileId('gt7'), 'gt3');
	assert.equal(defaultCarProfileId(null), 'gt3');
	assert.equal(CAR_PROFILES.gt3.fuelEffectSPerL, FUEL_EFFECT_S_PER_L);
	assert.ok(CAR_PROFILES.f1.fuelEffectSPerL < CAR_PROFILES.gt3.fuelEffectSPerL);
	assert.ok(isCarProfileId('road'));
	assert.ok(!isCarProfileId('toString'));
});

test('the Kalman filter drops a slow lap in traffic instead of bending the trend', () => {
	const times = [90.1, 90.2, 90.3, 90.4, 93.5, 90.6, 90.7, 90.8];
	const laps = [record(1, 95), ...times.map((time, i) => record(i + 2, time))];
	const result = modelDegradation(laps, options);
	assert.deepEqual(result.outlierLaps, [6]);
	assert.ok(Math.abs(result.degradationS - 0.1) < 0.02, result.degradationS);
	assert.ok(!result.isCliff);
	// The smoothed trend passes near the clean laps, not the outlier.
	const atOutlier = result.trend.find(lap => lap.lap === 6);
	assert.ok(Math.abs(atOutlier.lapTimeS - 90.5) < 0.1, atOutlier.lapTimeS);
});

test('two slow laps in a row are a real step, not outliers', () => {
	const times = [90.1, 90.2, 90.3, 90.4, 92.5, 92.6, 92.7];
	const laps = [record(1, 95), ...times.map((time, i) => record(i + 2, time))];
	const result = modelDegradation(laps, options);
	assert.deepEqual(result.outlierLaps, [6]);
	assert.ok(result.fitLaps.some(lap => lap.lap === 7));
});

test('a rising degradation rate is reported as a tyre cliff', () => {
	// 0.05 s/lap for six laps, then 0.4 s/lap.
	const times = [];
	let time = 90;
	for (let age = 2; age <= 14; age += 1) {
		time += age <= 8 ? 0.05 : 0.4;
		times.push(time);
	}
	const laps = [record(1, 95), ...times.map((value, i) => record(i + 2, value))];
	const result = modelDegradation(laps, options);
	assert.ok(result.isCliff, result.rateChangeS);
	assert.ok(result.degradationS > 0.25, result.degradationS);
	assert.ok(result.trend[0].rateS < 0.15, result.trend[0].rateS);
});

test('the trend filter and smoother recover a noiseless line', () => {
	const { runTrendFilter } = require(`${base}/kalmanTrendModel`);
	const measurements = new Map([1, 2, 3, 4, 5, 6].map(i => [i, 10 + 0.5 * i]));
	const steps = runTrendFilter(
		measurements,
		1,
		6,
		{ state: [10.5, 0], covariance: [1, 0, 1] },
		{ measurement: 0.0001, level: 1e-6, rate: 1e-6 },
	);
	assert.ok(Math.abs(steps[5].state[1] - 0.5) < 0.01);
	steps.forEach((step, i) => {
		assert.ok(Math.abs(step.smoothed[0] - (10 + 0.5 * (i + 1))) < 0.01, step.smoothed[0]);
	});
	// The smoother never knows less than the filter.
	assert.ok(steps[0].smoothedCovariance[2] <= steps[0].covariance[2] + 1e-12);
});

const { simulateStrategy, SC_PIT_FACTOR } = require(`${base}/strategySimulationModel`);

const strategyInput = extra => ({
	state: { tyreAge: 10, paceS: 90, rateS: 0.15, covariance: [0.01, 0, 0.0004] },
	noiseS: 0.2,
	lapsRemaining: 20,
	pitLossS: 22,
	warmUpLossS: 1,
	safetyCarChance: 0,
	runs: 400,
	...extra,
});

test('Monte Carlo: the best stop balances old tyres against fresh ones', () => {
	const result = simulateStrategy(strategyInput());
	// Stopping after k laps gains d·(a + k) on each of the L − k laps left, which peaks at
	// k = (L − a) / 2 = 5 for L = 20 laps to go and tyres a = 10 laps old.
	assert.equal(result.best.stopIn, 5);
	assert.equal(result.best.meanS, 0);
	assert.ok(result.best.bestShare > 0.2);
	assert.ok(result.noStop.isNoStop);
	assert.ok(result.noStop.meanS > 0);
	result.options.forEach(option => assert.ok(option.p10S <= option.p90S));
	const total = result.options.reduce((sum, option) => sum + option.bestShare, 0);
	assert.ok(Math.abs(total - 1) < 1e-9);
	// Same inputs and seed give the same answer.
	assert.deepEqual(simulateStrategy(strategyInput()).best, result.best);
});

test('Monte Carlo: no wear and a short race means staying out', () => {
	const result = simulateStrategy(
		strategyInput({
			lapsRemaining: 5,
			state: { tyreAge: 3, paceS: 90, rateS: 0, covariance: [0.01, 0, 0] },
		}),
	);
	assert.ok(result.best.isNoStop);
	assert.equal(simulateStrategy(strategyInput({ lapsRemaining: 1 })), null);
});

test('Monte Carlo: safety cars spread the best stop lap and are cheap to stop under', () => {
	const calm = simulateStrategy(strategyInput({ lapsRemaining: 30, runs: 600 }));
	const chaotic = simulateStrategy(
		strategyInput({ lapsRemaining: 30, runs: 600, safetyCarChance: 0.08 }),
	);
	assert.equal(calm.safetyCarShare, 0);
	assert.equal(calm.best.stopIn, 10);
	assert.ok(calm.best.bestShare > 0.9);
	assert.ok(chaotic.safetyCarShare > 0.5);
	assert.ok(chaotic.best.bestShare < 0.5, chaotic.best.bestShare);
	// Percentiles are against the best option in the same run, so shared safety cars cancel.
	assert.ok(chaotic.best.p90S - chaotic.best.p10S < 30);
	assert.ok(SC_PIT_FACTOR < 1);
});

test('undercut chance follows the uncertainty of the degradation rate', () => {
	const { undercutChance, normalCdf } = require(`${base}/pitWindowModel`);
	assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
	assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
	// Expected gain 3·0.1·10 − 1 = 2 s against a 2 s gap: a coin toss.
	assert.ok(Math.abs(undercutChance(0.1, 0.03, 10, 3, 2, 1) - 0.5) < 1e-6);
	assert.ok(undercutChance(0.1, 0.03, 10, 3, 1, 1) > 0.8);
	assert.equal(undercutChance(0.1, 0, 10, 3, 1, 1), 1);
});
