const test = require('node:test');
const assert = require('node:assert/strict');

const {
	trackTempTrend,
	resolveWeather,
	weatherAdvice,
	compassPoint,
	DEFAULT_MANUAL_WEATHER,
} = require('../.test-dist/ui/src/engines/racingMath/weatherModel');

const sample = (minutes, trackTempC, extra = {}) => ({
	t: minutes * 60000,
	airTempC: 25,
	trackTempC,
	humidity: 50,
	pressureHpa: 1013,
	isRaining: false,
	windSpeedMs: 2,
	windDirectionDeg: 180,
	...extra,
});

const ids = view => weatherAdvice(view).map(item => item.id);

test('track trend is the slope over the last 20 minutes, per 10 minutes', () => {
	assert.equal(trackTempTrend([sample(0, 30), sample(1, 31)]), null);
	// Three readings over two minutes: too short a span to call it a trend.
	assert.equal(trackTempTrend([sample(0, 30), sample(1, 31), sample(2, 32)]), null);
	const rising = [0, 2, 4, 6, 8, 10].map(m => sample(m, 30 + m * 0.2));
	assert.ok(Math.abs(trackTempTrend(rising) - 2) < 1e-9);
	// Old readings outside the window do not count.
	const late = [sample(0, 10), ...[30, 35, 40, 45].map(m => sample(m, 40))];
	assert.equal(trackTempTrend(late), 0);
});

test('source weather wins over the manual input', () => {
	const manual = { condition: 'damp', airTempC: 15, trackTempC: 18 };
	const fromDriver = resolveWeather([], manual);
	assert.equal(fromDriver.origin, 'manual');
	assert.equal(fromDriver.condition, 'damp');
	assert.equal(fromDriver.trackTrendC10, null);

	const fromSource = resolveWeather([sample(0, 42, { isRaining: true })], manual);
	assert.equal(fromSource.origin, 'session');
	assert.equal(fromSource.condition, 'wet');
	assert.equal(fromSource.trackTempC, 42);
});

test('advice follows rain, track temperature, trend and wind', () => {
	const base = resolveWeather([], DEFAULT_MANUAL_WEATHER);
	assert.deepEqual(ids(base), ['stable']);
	assert.deepEqual(ids({ ...base, trackTempC: 50 }), ['hotTrack']);
	assert.deepEqual(ids({ ...base, trackTempC: 12 }), ['coldTrack']);
	// In the wet the rain advice replaces the temperature one.
	assert.deepEqual(ids({ ...base, condition: 'wet', trackTempC: 12 }), ['rain']);
	assert.deepEqual(ids({ ...base, condition: 'damp', trackTempC: 12 }), ['damp', 'coldTrack']);
	assert.deepEqual(ids({ ...base, trackTrendC10: 1.5, windSpeedMs: 8 }), ['warming', 'wind']);
	assert.deepEqual(ids({ ...base, trackTrendC10: -1.2 }), ['cooling']);
	assert.equal(weatherAdvice({ ...base, trackTempC: 50 })[0].tone, 'warning');
});

test('compass points wrap around', () => {
	assert.equal(compassPoint(0), 'N');
	assert.equal(compassPoint(359), 'N');
	assert.equal(compassPoint(225), 'SW');
	assert.equal(compassPoint(-90), 'W');
});
