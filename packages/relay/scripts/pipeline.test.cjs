const test = require('node:test');
const assert = require('node:assert/strict');

const { LapTracker } = require('../dist/pipeline/lapTracker');
const { buildMockTrack, estimateLapTimeS } = require('../dist/sources/mock/mockTrack');
const { MockSource } = require('../dist/sources/mock/mockSource');

const frame = (lap, lapTimeMs, lapDistance) => ({ lap, lapTimeMs, lapDistance });

test('lap tracker splits sectors by distance and closes the lap', () => {
	const tracker = new LapTracker(3000);
	tracker.push(frame(1, 0, 0));
	tracker.push(frame(1, 20000, 999));
	tracker.push(frame(1, 21000, 1001));
	tracker.push(frame(1, 50000, 2001));
	tracker.push(frame(1, 80000, 2990));
	const lap = tracker.push(frame(2, 10, 1), 80500);
	assert.equal(lap.lap, 1);
	assert.equal(lap.lapTimeMs, 80500);
	assert.deepEqual(lap.sectorsMs, [21000, 29000, 30500]);
	assert.equal(lap.isValid, true);
});

test('lap tracker marks a short lap invalid', () => {
	const tracker = new LapTracker(3000);
	tracker.push(frame(1, 0, 0));
	tracker.push(frame(1, 5000, 400));
	const lap = tracker.push(frame(2, 0, 0));
	assert.equal(lap.isValid, false);
});

test('mock circuit has a plausible length and lap time', () => {
	const track = buildMockTrack();
	assert.ok(track.length > 3000 && track.length < 6000, `length ${track.length}`);
	const lap = estimateLapTimeS(track);
	assert.ok(lap > 60 && lap < 130, `lap ${lap}`);
});

test('mock source produces bounded channels', () => {
	const noop = () => undefined;
	const mock = new MockSource(
		{ session: noop, frame: noop, lap: noop, field: noop, status: noop },
		{},
	);
	for (let i = 0; i < 60 * 90; i += 1) {
		const f = mock.step(1 / 60);
		assert.ok(f.throttle >= 0 && f.throttle <= 1);
		assert.ok(f.brake >= 0 && f.brake <= 1);
		assert.ok(Math.abs(f.gLat) < 3, `gLat ${f.gLat}`);
		assert.ok(f.speed >= 0 && f.speed < 320);
	}
});
