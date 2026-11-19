const test = require('node:test');
const assert = require('node:assert/strict');

const { LapTracker } = require('../dist/pipeline/lapTracker');
const { buildMockTrack, estimateLapTimeS } = require('../dist/sources/mock/mockTrack');
const { MockSource, mockWeatherAt } = require('../dist/sources/mock/mockSource');

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
		{ session: noop, frame: noop, lap: noop, field: noop, weather: noop, status: noop },
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

test('mock weather warms the track, then clouds cool it', () => {
	const start = mockWeatherAt(0);
	const sunny = mockWeatherAt(13 * 60000);
	const cloudy = mockWeatherAt(30 * 60000);
	assert.ok(sunny.trackTempC > start.trackTempC + 5);
	assert.ok(cloudy.trackTempC < sunny.trackTempC - 5);
	assert.ok(cloudy.humidity > sunny.humidity);
	assert.ok(cloudy.trackTempC > cloudy.airTempC);
	assert.equal(cloudy.isRaining, false);
	assert.equal(cloudy.t, 30 * 60000);
});

test('demo race: realistic laps, one pit stop for softs, a chequered flag', () => {
	const laps = [];
	let field = [];
	const sink = {
		session: () => undefined,
		frame: () => undefined,
		lap: lap => laps.push(lap),
		field: entries => (field = entries),
		weather: () => undefined,
		status: () => undefined,
	};
	const mock = new MockSource(sink, { raceLaps: 6 }, 11);
	for (let i = 0; i < 60 * 60 * 15 && !mock.isFinished; i += 1) mock.advance(1 / 60);
	assert.equal(mock.isFinished, true);
	assert.deepEqual(
		laps.map(lap => lap.lap),
		[1, 2, 3, 4, 5, 6],
	);
	const pit = laps.filter(lap => lap.isPitLap);
	assert.deepEqual(
		pit.map(lap => lap.lap),
		[3],
	);
	assert.equal(laps[0].compound, 'Medium');
	assert.equal(laps[5].compound, 'Soft');
	laps.filter(lap => !lap.isPitLap && lap.lap > 1 && lap.lap !== 4).forEach(lap => {
		assert.ok(lap.lapTimeMs > 84000 && lap.lapTimeMs < 92000, `lap ${lap.lapTimeMs}`);
		assert.equal(lap.sectorsMs.length, 3);
	});
	assert.equal(field.length, 10);
	assert.ok(field.some(entry => entry.isPlayer));
});

test('lap tracker without a track length rejects restarts as laps', () => {
	const tracker = new LapTracker(null);
	tracker.push(frame(1, 0, 0));
	tracker.push(frame(1, 2700, 60));
	const restart = tracker.push(frame(2, 0, 0));
	assert.equal(restart.isValid, false);
	tracker.push(frame(2, 95000, 2490));
	const real = tracker.push(frame(3, 0, 0), 95100);
	assert.equal(real.isValid, true);
});
