const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src';
const { measureTrail, buildTrailBraking } = require(
	`${base}/engines/racingMath/trailBrakingModel`,
);

const STEP = 2;
const APEX_M = 600;

/**
 * A 1200 m lap with one corner at 600 m. The car turns from `turnInM` and `brakeAt(d)` gives
 * the brake pressure at each distance.
 */
const makeLap = (lap, brakeAt, turnInM = 540, slowKmh = 0) => {
	const count = 1200 / STEP + 1;
	const channels = {
		timeMs: new Float32Array(count),
		speed: new Float32Array(count),
		throttle: new Float32Array(count),
		brake: new Float32Array(count),
		gear: new Float32Array(count),
		gLat: new Float32Array(count),
		x: new Float32Array(count),
		z: new Float32Array(count),
	};
	let time = 0;
	for (let i = 0; i < count; i += 1) {
		const d = i * STEP;
		const speed = 220 - slowKmh - 130 * Math.max(0, 1 - Math.abs(d - APEX_M) / 160);
		channels.speed[i] = speed;
		channels.brake[i] = brakeAt(d);
		channels.throttle[i] = channels.brake[i] > 0 ? 0 : 1;
		channels.gear[i] = 4;
		channels.gLat[i] = d >= turnInM && d <= APEX_M + 80 ? 1.2 : 0;
		channels.timeMs[i] = time;
		if (i < count - 1) time += (STEP / (speed / 3.6)) * 1000;
	}
	return { lap, lapTimeMs: time, isValid: true, isPitLap: false, step: STEP, channels };
};

const apexIndex = APEX_M / STEP;
const segment = [0, 1200 / STEP + 1];

test('trail braking: brake easing off towards the apex while turning is good', () => {
	const lap = makeLap(1, d => (d >= 440 && d < 590 ? (d < 520 ? 0.9 : 0.9 * ((590 - d) / 70)) : 0));
	const metrics = measureTrail(lap, apexIndex, segment);
	assert.equal(metrics.verdict, 'good');
	assert.ok(metrics.trailShare > 0.3, `share ${metrics.trailShare}`);
	assert.ok(metrics.releaseBeforeApexM <= 14);
});

test('trail braking: braking finished before turn-in is straight-line braking', () => {
	const lap = makeLap(1, d => (d >= 420 && d < 520 ? 0.9 : 0), 560);
	assert.equal(measureTrail(lap, apexIndex, segment).verdict, 'straightLine');
});

test('trail braking: a step off the pedal and braking past the apex are flagged', () => {
	const abrupt = makeLap(1, d => (d >= 440 && d < 590 ? 0.9 : 0));
	assert.equal(measureTrail(abrupt, apexIndex, segment).verdict, 'abruptRelease');
	const over = makeLap(2, d => (d >= 440 && d < 630 ? 0.9 * Math.min(1, (630 - d) / 60) : 0));
	assert.equal(measureTrail(over, apexIndex, segment).verdict, 'overTrail');
	assert.equal(measureTrail(makeLap(3, () => 0), apexIndex, segment), null);
});

test('trail braking report lists corners by verdict and the fastest version', () => {
	const straight = makeLap(1, d => (d >= 420 && d < 520 ? 0.9 : 0), 560);
	const trailed = makeLap(
		2,
		d => (d >= 440 && d < 590 ? (d < 520 ? 0.9 : 0.9 * ((590 - d) / 70)) : 0),
		540,
		6,
	);
	const report = buildTrailBraking(straight, [straight, trailed]);
	assert.deepEqual(report.straightLine, [1]);
	assert.equal(report.corners[0].fastest, null);
	const other = buildTrailBraking(trailed, [straight, trailed]);
	assert.equal(other.corners[0].fastest.lap, 1);
});

test('overlay data: the window before a moment of a recorded lap, time relative to it', () => {
	const { buildLapWindowData, indexAtTime, lapValueAt } = require(
		`${base}/modules/chart/overlayFunctions`,
	);
	const lap = makeLap(1, () => 0);
	assert.equal(indexAtTime(lap.channels.timeMs, 0), 0);
	const lanes = [{ id: 'speed', series: [{ channel: 'speed' }, { channel: 'rpm' }] }];
	const tMs = 10000;
	const data = buildLapWindowData(lanes, lap, tMs, 5);
	const speed = data.series[0].data;
	assert.ok(speed.length > 10);
	assert.ok(speed[0][0] >= -5.1 && speed[speed.length - 1][0] >= -0.1);
	assert.ok(speed[speed.length - 1][0] <= 0.2);
	// A channel the lap does not have stays empty instead of failing.
	assert.deepEqual(data.series[1].data, []);
	assert.ok(lapValueAt(lap, 'speed', tMs) > 80);
});
