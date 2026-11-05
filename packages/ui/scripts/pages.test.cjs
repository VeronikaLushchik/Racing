const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src/pages/live';
const { classifyLaps } = require(`${base}/timing/timingFunctions`);
const { temperatureState, slipRatio, slipState } = require(`${base}/carHealth/carHealthFunctions`);
const { ggAxisLimit, isTrailBraking } = require(`${base}/driverTelemetry/driverTelemetryFunctions`);

const lap = (n, time, sectors, extra = {}) => ({
	lap: n,
	lapTimeMs: time,
	sectorsMs: sectors,
	isValid: true,
	isPitLap: false,
	compound: null,
	...extra,
});

test('sector colours: purple best, green improvement when set, yellow slower', () => {
	const result = classifyLaps([
		lap(1, 90000, [30000, 30000, 30000]),
		lap(2, 89000, [29000, 30500, 29500]),
		lap(3, 89500, [29500, 29800, 30200]),
		lap(4, 95000, [30000, 35000, 30000], { isPitLap: true }),
	]);
	assert.deepEqual(
		result.map(r => r.lapState),
		['green', 'purple', 'yellow', null],
	);
	assert.deepEqual(result[0].sectorStates, ['green', 'green', 'green']);
	assert.deepEqual(result[1].sectorStates, ['purple', 'yellow', 'purple']);
	assert.deepEqual(result[2].sectorStates, ['yellow', 'purple', 'yellow']);
	assert.deepEqual(result[3].sectorStates, [null, null, null]);
});

test('temperature state uses the working window', () => {
	const window = { min: 80, max: 105 };
	assert.equal(temperatureState(70, window), 'cold');
	assert.equal(temperatureState(95, window), 'optimal');
	assert.equal(temperatureState(110, window), 'hot');
});

test('driver helpers', () => {
	assert.equal(ggAxisLimit(0.4), 2);
	assert.equal(ggAxisLimit(3.95), 5);
	assert.equal(isTrailBraking(0.3, 1.2), true);
	assert.equal(isTrailBraking(0.3, 0.1), false);
});

test('slip ratio flags locking and wheelspin, ignores crawling speeds', () => {
	assert.equal(slipRatio(90, 100), -0.1);
	assert.equal(slipState(slipRatio(90, 100)), 'lock');
	assert.equal(slipState(slipRatio(108, 100)), 'spin');
	assert.equal(slipState(slipRatio(101, 100)), 'grip');
	assert.equal(slipRatio(5, 10), null);
	assert.equal(slipState(null), 'grip');
});
