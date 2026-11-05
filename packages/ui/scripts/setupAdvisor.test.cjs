const test = require('node:test');
const assert = require('node:assert/strict');

const {
	SetupEvidenceCollector,
	adviseSetup,
	balanceState,
	suggestChange,
	cornerPhase,
} = require('../.test-dist/ui/src/engines/racingMath/setupAdvisorModel');

const G = 9.81;
const context = { tyreWindowC: { min: 80, max: 105 }, trackTempC: 30 };

/**
 * A frame in a steady corner. `gain` scales the steering above the geometric need, so
 * gain > 1 at high G is understeer and a negative steer is counter-steer.
 */
const frame = ({ speed = 120, gLat = 0, gain = 1, brake = 0, throttle = 0.3, ...rest } = {}) => {
	const v = speed / 3.6;
	const curvature = (gLat * G) / (v * v);
	return {
		t: 0,
		lap: 1,
		lapTimeMs: 0,
		lapDistance: 0,
		speed,
		rpm: 6000,
		gear: 4,
		throttle,
		brake,
		steer: curvature * 30 * gain,
		gLat,
		gLong: 0,
		x: 0,
		z: 0,
		tyreTemps: null,
		tyreZones: null,
		brakeTemps: null,
		tyreWear: null,
		fuel: null,
		position: null,
		wheelSpeeds: null,
		suspension: null,
		...rest,
	};
};

const feed = (collector, count, options) => {
	for (let i = 0; i < count; i += 1) collector.push(frame(options));
};

const calibrated = () => {
	const collector = new SetupEvidenceCollector();
	feed(collector, 300, { speed: 80, gLat: 0.3 });
	return collector;
};

test('phases follow the pedals', () => {
	assert.equal(cornerPhase({ brake: 0.4, throttle: 0 }), 'entry');
	assert.equal(cornerPhase({ brake: 0, throttle: 0.8 }), 'exit');
	assert.equal(cornerPhase({ brake: 0, throttle: 0.2 }), 'mid');
});

test('a neutral car gets no balance advice', () => {
	const collector = calibrated();
	feed(collector, 400, { gLat: 1.2 });
	const evidence = collector.summary();
	assert.ok(Math.abs(evidence.balance.mid.ratio - 1) < 1e-6);
	assert.equal(balanceState(evidence.balance.mid), 'neutral');
	assert.deepEqual(adviseSetup(evidence, null, context), []);
});

test('mid-corner understeer suggests a softer front anti-roll bar', () => {
	const collector = calibrated();
	feed(collector, 800, { gLat: 1.3, gain: 1.4 });
	const evidence = collector.summary();
	assert.equal(balanceState(evidence.balance.mid), 'understeer');
	const [advice] = adviseSetup(evidence, { arbF: 6 }, context);
	assert.equal(advice.id, 'midUndersteer');
	assert.deepEqual(advice.changes[0], { field: 'arbF', direction: -1, from: 6, to: 5 });
	assert.equal(advice.changes[1].from, null);
	assert.equal(advice.changes[1].to, null);
});

test('counter-steer on exit is oversteer whatever the sign convention', () => {
	for (const sign of [1, -1]) {
		const collector = new SetupEvidenceCollector();
		feed(collector, 300, { speed: 80, gLat: 0.3, gain: sign });
		feed(collector, 400, { gLat: 1, throttle: 0.9, gain: sign });
		feed(collector, 60, { gLat: 1, throttle: 0.9, gain: -0.5 * sign });
		const ids = adviseSetup(collector.summary(), null, context).map(a => a.id);
		assert.deepEqual(ids, ['exitOversteer'], `sign ${sign}`);
	}
});

test('without calibration there is no balance verdict', () => {
	const collector = new SetupEvidenceCollector();
	feed(collector, 500, { gLat: 1.3, gain: 2 });
	const evidence = collector.summary();
	assert.equal(evidence.balance.mid.ratio, null);
	assert.equal(balanceState(evidence.balance.mid), 'unknown');
});

test('locking fronts move the brake balance to the rear', () => {
	const collector = new SetupEvidenceCollector();
	feed(collector, 200, { speed: 150, brake: 0.8, wheelSpeeds: [150, 150, 150, 150] });
	feed(collector, 40, { speed: 150, brake: 0.9, wheelSpeeds: [120, 140, 150, 150] });
	const [advice] = adviseSetup(collector.summary(), { brakeBalance: 0 }, context);
	assert.equal(advice.id, 'frontLocking');
	assert.deepEqual(advice.changes[0], { field: 'brakeBalance', direction: 1, from: 0, to: 1 });
});

test('rear wheelspin, bottoming and tyre balance are found', () => {
	const collector = new SetupEvidenceCollector();
	const hot = { tyreTemps: [100, 100, 85, 85] };
	feed(collector, 300, { speed: 160, throttle: 1, wheelSpeeds: [160, 160, 160, 160], ...hot });
	feed(collector, 60, { speed: 90, throttle: 1, wheelSpeeds: [90, 90, 100, 100], ...hot });
	// Front sits on its lowest point a third of the time at speed, the rear moves freely.
	for (let i = 0; i < 300; i += 1) {
		collector.push(
			frame({ speed: 200, suspension: [i % 3 ? 0.06 : 0.03, 0.06, 0.05 + i * 1e-4, 0.07] }),
		);
	}
	const ids = adviseSetup(collector.summary(), { rideHeightF: 70 }, context).map(a => a.id);
	assert.ok(ids.includes('rearWheelspin'), ids.join());
	assert.ok(ids.includes('bottomingFront'), ids.join());
	assert.ok(!ids.includes('bottomingRear'), ids.join());
	assert.ok(ids.includes('frontTyresHot'), ids.join());
	const bottoming = adviseSetup(collector.summary(), { rideHeightF: 70 }, context).find(
		a => a.id === 'bottomingFront',
	);
	assert.equal(bottoming.changes[0].to, 75);
});

test('suggested values stay inside the field range', () => {
	assert.equal(suggestChange('arbF', -1, { arbF: 1 }).to, 1);
	assert.equal(suggestChange('springR', 1, { springR: 2.35 }).to, 2.45);
	assert.equal(suggestChange('brakeBalance', 1, { brakeBalance: 5 }).to, 5);
});

test('the summary object is reused until new data arrives, and reset clears it', () => {
	const collector = calibrated();
	const first = collector.summary();
	assert.equal(collector.summary(), first);
	feed(collector, 30, { gLat: 1 });
	assert.notEqual(collector.summary(), first);
	collector.reset();
	assert.equal(collector.summary().frames, 0);
	assert.equal(collector.summary().calibrationSamples, 0);
});
