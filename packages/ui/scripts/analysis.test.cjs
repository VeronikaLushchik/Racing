const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src/engines/racingMath';
const { buildDistanceGrid, resampleByDistance, valueAtDistance } = require(
	`${base}/distanceResampling`,
);
const { findCorners, compareLaps, describeCorner, buildDeltaSeries } = require(
	`${base}/ghostLapModel`,
);
const { squareBounds, sectorMarks, deltaRate } = require(`${base}/trackMapModel`);

const STEP = 2;
const LENGTH_M = 2000;
const CORNERS = [
	{ at: 600, drop: 160 },
	{ at: 1400, drop: 130 },
];

/** Synthetic lap on a 2 m grid: two V-shaped corners, braking before, full throttle after. */
const makeLap = (options = {}) => {
	const { brakeLaterM = 0, exitLossKmh = 0 } = options;
	const count = LENGTH_M / STEP + 1;
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
		let speed = 250;
		let brake = 0;
		let throttle = 1;
		CORNERS.forEach((corner, n) => {
			const k = Math.max(0, 1 - Math.abs(d - corner.at) / 150);
			speed -= corner.drop * k;
			const brakeStart = corner.at - 150 + (n === 0 ? brakeLaterM : 0);
			if (d >= brakeStart && d < corner.at - 10) {
				brake = 0.8;
				throttle = 0;
			} else if (d >= corner.at - 10 && d < corner.at + 30) {
				throttle = 0.3;
			}
			if (n === 0 && d >= corner.at && d < corner.at + 150) {
				speed -= exitLossKmh;
			}
		});
		channels.speed[i] = speed;
		channels.brake[i] = brake;
		channels.throttle[i] = throttle;
		channels.gear[i] = Math.min(7, Math.ceil(speed / 40));
		channels.x[i] = Math.cos((d / LENGTH_M) * Math.PI * 2) * 300;
		channels.z[i] = Math.sin((d / LENGTH_M) * Math.PI * 2) * 150;
		channels.timeMs[i] = time;
		time += (STEP / (speed / 3.6)) * 1000;
	}
	return {
		lap: 1,
		lapTimeMs: time,
		sectorsMs: [time / 2, time / 2],
		isValid: true,
		isPitLap: false,
		compound: null,
		step: STEP,
		distance: buildDistanceGrid(LENGTH_M, STEP),
		channels,
	};
};

test('distance grid and resampling line laps up by metre', () => {
	const grid = buildDistanceGrid(10, 2);
	assert.deepEqual(Array.from(grid), [0, 2, 4, 6, 8, 10]);
	const values = resampleByDistance([1, 5, 9], [10, 50, 90], grid);
	assert.deepEqual(Array.from(values), [10, 20, 40, 60, 80, 90]);
	assert.equal(valueAtDistance(values, 2, 3), 30);
	assert.equal(valueAtDistance(values, 2, 99), 90);
});

test('corners are the speed minima of the reference lap', () => {
	const corners = findCorners(makeLap().channels.speed, STEP);
	assert.deepEqual(
		corners.map(corner => [corner.number, corner.distance, Math.round(corner.minSpeed)]),
		[
			[1, 600, 90],
			[2, 1400, 120],
		],
	);
});

test('a later brake point with a slower exit is reported for that corner only', () => {
	const reference = makeLap();
	const compare = makeLap({ brakeLaterM: 12, exitLossKmh: 6 });
	const [first, second] = compareLaps(reference, compare);

	assert.equal(first.brakePointDeltaM, 12);
	assert.equal(first.insight.kind, 'lateBrakeSlowExit');
	assert.deepEqual(first.insight.args, [12, 6]);
	assert.ok(first.timeDeltaS > 0, 'the slower exit costs time');

	assert.equal(second.brakePointDeltaM, 0);
	assert.equal(second.insight.kind, 'similar');
	assert.ok(Math.abs(second.timeDeltaS) < 1e-3);
});

test('insight rules pick the most telling difference', () => {
	assert.equal(describeCorner(-8, 0, 0, 3).kind, 'earlyBrakeFastExit');
	assert.equal(describeCorner(7, 0, 0, 0).kind, 'lateBrake');
	assert.deepEqual(describeCorner(null, -3.4, null, 0), { kind: 'lessApexSpeed', args: [3] });
	assert.equal(describeCorner(0, 0, 15, 0).kind, 'lateThrottle');
	assert.equal(describeCorner(1, 1, 1, 1).kind, 'similar');
	assert.deepEqual(describeCorner(1, 1, 1, 1, 0.334), { kind: 'slowerSameInputs', args: [0.33] });
});

test('delta grows where the compared lap is slower', () => {
	const reference = makeLap();
	const compare = makeLap({ exitLossKmh: 6 });
	const delta = buildDeltaSeries(reference, compare);
	assert.equal(delta[0], 0);
	assert.ok(delta[delta.length - 1] > 0);
	const rate = deltaRate(delta, STEP);
	assert.ok(rate[650 / STEP] > 0, 'losing time on the exit of T1');
	assert.ok(Math.abs(rate[1000 / STEP]) < 1e-6, 'nothing lost on the straight');
});

test('track bounds keep metres square and sectors land on the lap', () => {
	const bounds = squareBounds([0, 100], [0, 50], 400, 400, 0);
	assert.equal(bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin);
	assert.equal(bounds.xMin, 0);
	assert.equal(bounds.zMin, -25);

	const marks = sectorMarks(makeLap());
	assert.equal(marks.length, 1);
	assert.equal(marks[0].sector, 2);
	assert.ok(marks[0].distance > 900 && marks[0].distance < 1100);
});
