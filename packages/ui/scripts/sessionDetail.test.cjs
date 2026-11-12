const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src';
const { buildDistanceGrid } = require(`${base}/engines/racingMath/distanceResampling`);
const { buildLapDetails, buildCornerMatrix } = require(
	`${base}/engines/racingMath/sessionDetailModel`,
);
const { lossLevel } = require(`${base}/pages/analyst/analystFunctions`);

const STEP = 2;
const LENGTH_M = 2000;
const CORNERS = [600, 1400];

/** Synthetic lap with two corners; `apex[n]` adds speed through corner n. */
const makeLap = (lap, { apex = {}, ...rest } = {}) => {
	const count = LENGTH_M / STEP + 1;
	const channels = {};
	['timeMs', 'speed', 'throttle', 'brake', 'gear', 'gLat', 'x', 'z'].forEach(name => {
		channels[name] = new Float32Array(count);
	});
	let time = 0;
	for (let i = 0; i < count; i += 1) {
		const d = i * STEP;
		let speed = 250;
		let lateral = 0;
		CORNERS.forEach((at, n) => {
			const k = Math.max(0, 1 - Math.abs(d - at) / 150);
			speed -= (150 - (apex[n] ?? 0)) * k;
			lateral = Math.max(lateral, 1.5 * k);
		});
		channels.speed[i] = speed;
		channels.throttle[i] = speed > 200 ? 1 : 0;
		channels.brake[i] = speed <= 200 && d % 800 < 600 ? 0.6 : 0;
		channels.gear[i] = Math.min(7, Math.ceil(speed / 40));
		channels.gLat[i] = lateral;
		channels.timeMs[i] = time;
		if (i < count - 1) time += (STEP / (speed / 3.6)) * 1000;
	}
	return {
		lap,
		lapTimeMs: time,
		sectorsMs: [],
		isValid: true,
		isPitLap: false,
		compound: null,
		step: STEP,
		distanceScale: 1,
		distance: buildDistanceGrid(LENGTH_M, STEP),
		channels,
		tyreTempAvg: [80, 82, 78, 79],
		tyreWearEnd: null,
		fuelStart: 40,
		fuelEnd: 38.5,
		...rest,
	};
};

test('lap details: speeds, shifts, grip, fuel and tyres per lap', () => {
	const [first, second] = buildLapDetails([makeLap(2, { apex: { 0: 10 } }), makeLap(1)]);
	assert.equal(first.lap, 1);
	assert.equal(second.isBest, true);
	assert.ok(first.deltaToBestMs > 0);
	assert.equal(Math.round(first.topSpeedKmh), 250);
	assert.equal(Math.round(first.minSpeedKmh), 100);
	assert.ok(first.avgSpeedKmh > 100 && first.avgSpeedKmh < 250);
	assert.ok(first.gearChanges >= 4);
	assert.ok(Math.abs(first.maxLatG - 1.5) < 0.01);
	assert.equal(first.fuelUsedL, 1.5);
	assert.equal(first.tyreTempC, 79.75);
	assert.ok(first.pedals.fullThrottle > 0.3);
});

test('corner matrix: each lap against the fastest version of each corner', () => {
	const matrix = buildCornerMatrix([
		makeLap(1),
		makeLap(2, { apex: { 0: 15 } }),
		makeLap(3, { apex: { 1: 15 } }),
		makeLap(4, { isValid: false, apex: { 0: 40, 1: 40 } }),
	]);
	assert.equal(matrix.corners.length, 2);
	assert.deepEqual(
		matrix.rows.map(row => row.lap),
		[1, 2, 3],
	);
	const [lap1, lap2, lap3] = matrix.rows;
	assert.ok(lap2.cells[0].lossS < 0.001, 'lap 2 is fastest through T1');
	assert.ok(lap3.cells[1].lossS < 0.001, 'lap 3 is fastest through T2');
	assert.ok(lap1.cells[0].lossS > 0.05 && lap1.cells[1].lossS > 0.05);
	assert.ok(Math.abs(lap1.totalLossS - lap1.cells[0].lossS - lap1.cells[1].lossS) < 1e-9);
	assert.equal(buildCornerMatrix([makeLap(1, { isValid: false })]), null);
});

test('loss level buckets', () => {
	assert.deepEqual([0, 0.05, 0.2, 0.4, 1].map(lossLevel), [0, 1, 2, 3, 4]);
});

test('lap quality: restarts, partial laps and teleports are not laps', () => {
	const { isPlausibleLap, withLapQuality } = require(`${base}/engines/racingMath/lapQuality`);
	assert.equal(isPlausibleLap(2705, 60, null), false);
	assert.equal(isPlausibleLap(95000, 1200, 2500), false);
	assert.equal(isPlausibleLap(95000, 2480, 2500), true);
	assert.equal(isPlausibleLap(95000, null, null), true);
	const short = { ...makeLap(1), lapTimeMs: 13510, distance: buildDistanceGrid(300, STEP) };
	// Full distance in 21 s means an average far above the top speed: the car was reset.
	const teleport = { ...makeLap(4), lapTimeMs: 21000 };
	const kept = withLapQuality([short, makeLap(2), makeLap(3), teleport], null);
	assert.deepEqual(
		kept.map(record => record.lap),
		[2, 3],
	);
});
