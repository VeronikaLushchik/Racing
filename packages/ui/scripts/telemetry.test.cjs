const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src';
const { TelemetryRingBuffer } = require(`${base}/modules/telemetry/ringBuffer`);
const { LapTrace, computeDelta, timeAtDistance } = require(`${base}/engines/racingMath/deltaModel`);

const sample = t => ({
	t,
	speed: t / 10,
	throttle: 1,
	brake: 0,
	gear: 3,
	rpm: 8000,
	gLat: 0,
	gLong: 0,
	lapDistance: t,
});

test('ring buffer keeps the newest samples in order after wrapping', () => {
	const buffer = new TelemetryRingBuffer(4);
	[10, 20, 30, 40, 50, 60].forEach(t => buffer.push(sample(t)));
	assert.equal(buffer.count, 4);
	assert.deepEqual(
		[0, 1, 2, 3].map(i => buffer.get('t', i)),
		[30, 40, 50, 60],
	);
	assert.equal(buffer.latest('speed'), 6);
	assert.equal(buffer.firstIndexSince(45), 2);
	assert.equal(buffer.firstIndexSince(0), 0);
	assert.equal(buffer.firstIndexSince(999), 4);
});

test('lap trace interpolates time at distance and ignores going backwards', () => {
	const trace = new LapTrace(1);
	trace.push(0, 0);
	trace.push(100, 2000);
	trace.push(90, 2100);
	trace.push(200, 5000);
	assert.equal(trace.length, 3);
	assert.equal(timeAtDistance(trace, 150), 3500);
	assert.equal(timeAtDistance(trace, 250), null);
});

test('delta is negative when ahead of the reference lap', () => {
	const reference = new LapTrace(2);
	reference.push(0, 0);
	reference.push(1000, 20000);
	assert.equal(computeDelta(reference, 500, 9500), -0.5);
	assert.equal(computeDelta(null, 500, 9500), null);
});

test('lap trace rebuilt from a stored lap answers like the live one', () => {
	const trace = LapTrace.fromArrays(
		3,
		new Float32Array([0, 2, 4, 4]),
		new Float32Array([0, 100, 200, 250]),
	);
	assert.equal(trace.lap, 3);
	assert.equal(trace.length, 3);
	assert.equal(timeAtDistance(trace, 3), 150);
});
