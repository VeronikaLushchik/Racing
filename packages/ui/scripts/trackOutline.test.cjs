const test = require('node:test');
const assert = require('node:assert/strict');

const {
	buildOutline,
	alignToOutline,
	pointAtDistance,
	outlinesMatch,
	findOutlineAt,
	mergeOutline,
} = require('../.test-dist/ui/src/engines/racingMath/trackOutlineModel');

/** A circle of radius `r` (length 2πr) sampled every 2 m, optionally shifted. */
const circleLap = (r, lapTimeMs, shiftX = 0) => {
	const step = 2;
	const count = Math.round((2 * Math.PI * r) / step) + 1;
	const x = [];
	const z = [];
	for (let i = 0; i < count; i += 1) {
		const angle = (i * step) / r;
		x.push(Math.cos(angle) * r + shiftX);
		z.push(Math.sin(angle) * r);
	}
	return { step, x, z, lapTimeMs };
};

const meta = id => ({ id, name: id, savedAt: 0 });

test('outline keeps one point every 4 m and the lap length', () => {
	const outline = buildOutline(circleLap(200, 60000), meta('a'));
	assert.equal(outline.x.length, Math.ceil(circleLap(200, 0).x.length / 2));
	assert.ok(Math.abs(outline.length - 2 * Math.PI * 200) < 2);
});

test('a car on the track keeps its coordinates, a car elsewhere is placed by distance', () => {
	const outline = buildOutline(circleLap(200, 60000), meta('a'));
	const onTrack = alignToOutline(outline, { x: 203, z: 0, lapDistance: 0 });
	assert.deepEqual(onTrack, { x: 203, z: 0, mode: 'coordinates' });

	const quarter = (Math.PI * 200) / 2;
	const elsewhere = alignToOutline(outline, { x: 5000, z: 5000, lapDistance: quarter });
	assert.equal(elsewhere.mode, 'distance');
	assert.ok(Math.abs(elsewhere.x) < 3 && Math.abs(elsewhere.z - 200) < 3);

	// Another source measures the lap a little longer: the fraction of the lap still lines up.
	const scaled = pointAtDistance(outline, quarter * 1.1, outline.length * 1.1);
	assert.ok(Math.abs(scaled.z - 200) < 3);
});

test('the same track is recognised, a different one is not', () => {
	const a = buildOutline(circleLap(200, 60000), meta('a'));
	assert.equal(outlinesMatch(a, buildOutline(circleLap(200, 59000, 3), meta('b'))), true);
	assert.equal(outlinesMatch(a, buildOutline(circleLap(200, 59000, 300), meta('c'))), false);
	assert.equal(outlinesMatch(a, buildOutline(circleLap(260, 59000), meta('d'))), false);
	assert.equal(findOutlineAt([a], 0, 199).id, 'a');
	assert.equal(findOutlineAt([a], 0, 0), null);
});

test('a faster lap of a saved track replaces it but keeps the name', () => {
	const saved = { ...buildOutline(circleLap(200, 60000), meta('a')), name: 'Suzuka' };
	const slower = buildOutline(circleLap(200, 61000, 2), meta('b'));
	const faster = buildOutline(circleLap(200, 59000, 2), meta('c'));
	const other = buildOutline(circleLap(400, 90000), meta('d'));

	assert.equal(mergeOutline([saved], slower)[0], saved);
	const merged = mergeOutline([saved], faster);
	assert.equal(merged.length, 1);
	assert.equal(merged[0].name, 'Suzuka');
	assert.equal(merged[0].id, 'a');
	assert.equal(merged[0].lapTimeMs, 59000);
	assert.equal(mergeOutline([saved], other).length, 2);
});
