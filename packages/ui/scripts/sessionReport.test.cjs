const test = require('node:test');
const assert = require('node:assert/strict');

const base = '../.test-dist/ui/src/engines/racingMath';
const { buildDistanceGrid } = require(`${base}/distanceResampling`);
const { buildSessionReport, pedalShares, lapSectors, OUTLIER_RATIO } = require(
	`${base}/sessionReportModel`,
);
const { SetupEvidenceCollector } = require(`${base}/setupAdvisorModel`);

const STEP = 2;
const LENGTH_M = 2000;
const CORNERS = [600, 1400];
const tyreWindowC = { min: 80, max: 105 };

/**
 * Synthetic lap on a 2 m grid with two corners. `apexKmh` adds speed through one corner,
 * `brakeLaterM` moves its brake point, `coastM` lifts both pedals before each corner and
 * `slowKmh` slows the whole lap.
 */
const makeLap = (lap, options = {}) => {
	const { apex = {}, brakeLaterM = {}, coastM = 0, slowKmh = 0, ...rest } = options;
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
		let speed = 250 - slowKmh;
		let brake = 0;
		let throttle = 1;
		CORNERS.forEach((at, n) => {
			const k = Math.max(0, 1 - Math.abs(d - at) / 150);
			speed -= (150 - (apex[n] ?? 0)) * k;
			const brakeStart = at - 150 + (brakeLaterM[n] ?? 0);
			if (d >= brakeStart - coastM && d < brakeStart) {
				throttle = 0;
			} else if (d >= brakeStart && d < at - 10) {
				brake = 0.8;
				throttle = 0;
			} else if (d >= at - 10 && d < at + 30) {
				throttle = 0.3;
			}
		});
		channels.speed[i] = speed;
		channels.brake[i] = brake;
		channels.throttle[i] = throttle;
		channels.gear[i] = Math.min(7, Math.ceil(speed / 40));
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
		tyreTempAvg: null,
		tyreWearEnd: null,
		fuelStart: null,
		fuelEnd: null,
		...rest,
	};
};

const report = (records, extra = {}) =>
	buildSessionReport({ records, evidence: null, setup: null, tyreWindowC, weather: null, ...extra });

test('no laps, no report', () => {
	assert.equal(report([]), null);
});

test('one lap gives a summary but no corner comparison', () => {
	const result = report([makeLap(1)]);
	assert.equal(result.summary.lapCount, 1);
	assert.equal(result.summary.bestLap, 1);
	assert.equal(result.corners.length, 0);
	assert.equal(result.sectors.length, 3);
	assert.equal(result.isSyntheticSectors, true);
	assert.equal(result.summary.idealLapMs, null);
});

test('synthetic sectors add up to the lap time', () => {
	const lap = makeLap(1);
	const { sectors } = lapSectors([lap], [lap]);
	const sum = sectors.get(1).reduce((a, b) => a + b, 0);
	assert.ok(Math.abs(sum - lap.lapTimeMs) < 1);
});

test('real sectors are used when every clean lap has them', () => {
	const laps = [makeLap(1), makeLap(2)].map(lap => ({
		...lap,
		sectorsMs: [lap.lapTimeMs * 0.4, lap.lapTimeMs * 0.6],
	}));
	const result = report(laps);
	assert.equal(result.isSyntheticSectors, false);
	assert.equal(result.sectors.length, 2);
});

test('outliers, invalid and pit laps are not clean', () => {
	const best = makeLap(2);
	const slow = makeLap(3, { slowKmh: 60 });
	assert.ok(slow.lapTimeMs > best.lapTimeMs * OUTLIER_RATIO);
	const result = report([
		makeLap(1, { isPitLap: true }),
		best,
		slow,
		makeLap(4, { isValid: false }),
		makeLap(5, { apex: { 0: -5 } }),
	]);
	assert.deepEqual(
		result.laps.filter(lap => lap.isClean).map(lap => lap.lap),
		[2, 5],
	);
	assert.equal(result.laps.find(lap => lap.lap === 3).isOutlier, true);
	assert.equal(result.summary.invalidLapCount, 1);
});

test('ideal lap takes the best version of each corner', () => {
	// Lap 1 is faster in T1, lap 2 in T2.
	const lapA = makeLap(1, { apex: { 0: 10 } });
	const lapB = makeLap(2, { apex: { 1: 14 } });
	const result = report([lapA, lapB]);
	const best = result.summary.bestLap;
	assert.equal(best, 2);
	assert.equal(result.corners.length, 2);
	assert.equal(result.corners[0].bestLap, 1);
	assert.equal(result.corners[1].bestLap, 2);
	assert.ok(result.corners[0].bestLapLossS > 0.03);
	assert.ok(result.summary.idealLapMs < lapB.lapTimeMs - 30);

	const top = result.improvements[0];
	assert.equal(top.kind, 'corner');
	assert.equal(top.corner, 1);
	assert.equal(top.fromLap, 1);
	assert.equal(top.insight.kind, 'moreApexSpeed');
});

test('coasting is found in the pedal data', () => {
	const lap = makeLap(1, { coastM: 80 });
	const shares = pedalShares(lap);
	assert.ok(shares.coasting > 0.06, `coasting ${shares.coasting}`);
	assert.ok(shares.fullThrottle > 0.5);
	const result = report([lap, makeLap(2, { coastM: 80 })]);
	assert.ok(result.findings.some(finding => finding.id === 'coasting'));
	assert.equal(pedalShares(makeLap(3)).coasting, 0);
});

test('brake points that move lap to lap are flagged', () => {
	const laps = [0, 30, -25, 20].map((shift, i) => makeLap(i + 1, { brakeLaterM: { 0: shift } }));
	const result = report(laps);
	assert.ok(result.corners[0].brakeSpreadM > 8);
	const finding = result.findings.find(item => item.id === 'brakeSpread');
	assert.ok(finding);
	assert.match(finding.args[0], /T1/);
});

test('a falling pace trend is reported', () => {
	const laps = [0, 1, 2, 3, 4].map(i => makeLap(i + 1, { slowKmh: i * 1.5 }));
	const result = report(laps);
	assert.ok(result.summary.trendSPerLap > 0.15);
	assert.ok(result.findings.some(finding => finding.id === 'fading'));
});

test('setup and weather advice come from the existing models', () => {
	const evidence = new SetupEvidenceCollector();
	for (let i = 0; i < 400; i += 1) {
		evidence.push({
			t: i,
			lap: 1,
			lapTimeMs: 0,
			lapDistance: 0,
			speed: 150,
			rpm: 6000,
			gear: 4,
			throttle: 0.3,
			brake: 0,
			steer: null,
			gLat: 0,
			gLong: 0,
			x: 0,
			z: 0,
			tyreTemps: [70, 70, 95, 95],
			tyreZones: null,
			brakeTemps: null,
			tyreWear: null,
			fuel: null,
			position: null,
		});
	}
	const weather = {
		origin: 'manual',
		condition: 'dry',
		airTempC: 30,
		trackTempC: 50,
		humidity: null,
		windSpeedMs: null,
		windDirectionDeg: null,
		trackTrendC10: null,
	};
	const result = report([makeLap(1), makeLap(2)], {
		evidence: evidence.summary(),
		setup: { arbR: 5 },
		weather,
	});
	assert.equal(result.setupFrames, 400);
	assert.ok(result.setupAdvice.some(item => item.id === 'rearTyresHot'));
	assert.ok(result.weatherAdvice.some(item => item.id === 'hotTrack'));
	const setupItem = result.improvements[result.improvements.length - 1];
	assert.equal(setupItem.kind, 'setup');
	assert.equal(setupItem.advice.changes[0].to, 4);
});

test('no live frames means no setup advice', () => {
	const result = report([makeLap(1)], { evidence: new SetupEvidenceCollector().summary() });
	assert.equal(result.setupFrames, 0);
	assert.deepEqual(result.setupAdvice, []);
});
