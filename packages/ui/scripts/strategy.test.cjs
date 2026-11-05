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
	assert.ok(Math.abs(result.degradationS - 0.2) < 1e-9);
	assert.deepEqual(
		result.forecast.map(lap => [lap.lap, Number(lap.lapTimeS.toFixed(3))]),
		[
			[6, 91],
			[7, 91.2],
			[8, 91.4],
		],
	);
});

test('fuel burn is taken out before fitting, so a lighter car does not hide wear', () => {
	// Raw lap times stay flat: 0.3 s/lap of wear is cancelled by 10 L/lap less fuel.
	const laps = [1, 2, 3, 4, 5].map(lap =>
		record(lap, 90, { fuelStart: 100 - (lap - 1) * 10, fuelEnd: 90 - (lap - 1) * 10 }),
	);
	const result = modelDegradation(laps, options);
	assert.ok(Math.abs(result.degradationS - 10 * FUEL_EFFECT_S_PER_L) < 1e-9);
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
