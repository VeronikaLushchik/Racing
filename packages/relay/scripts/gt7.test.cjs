/** @format */

const test = require('node:test');
const assert = require('node:assert/strict');

const { salsa20Xor } = require('../dist/sources/gt7/salsa20');
const {
	buildGt7Plain,
	decryptGt7,
	encryptGt7,
	parseGt7,
} = require('../dist/sources/gt7/gt7Packet');
const { Gt7Normalizer } = require('../dist/sources/gt7/gt7Normalizer');

// Reference keystream generated with pycryptodome: Salsa20.new(key=bytes(range(32)), nonce=1..8)
const REFERENCE =
	'2d8626a68e241c92749dc7efa74b6ee4b86f375ea5fef57c0d7c5d431c17dc3cdc87684cf21de0336c440a48569906510c3524e9a11077ce75c23321ce4afcdc09aab4c3d031467ab246a5732bce5b2c486243475819666bf9a698f90d3cb64b4b482e5eed4d0323e7d6548d3445ed9a4db2326f14ddcbacee90caeb3a8a4bd660f1';

test('salsa20 matches the pycryptodome reference across block boundaries', () => {
	const key = Uint8Array.from({ length: 32 }, (_, i) => i);
	const nonce = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
	const out = salsa20Xor(key, nonce, new Uint8Array(130));
	assert.equal(Buffer.from(out).toString('hex'), REFERENCE);
});

test('GT7 packet survives encrypt → decrypt → parse', () => {
	const plain = buildGt7Plain({
		packetId: 42,
		speedMs: 50,
		rpm: 7200,
		gear: 4,
		throttle: 1,
		brake: 0,
		currentLap: 3,
		lastLapMs: 91234,
		tyreTemps: [81, 82, 79, 80],
		position: [10, 1, -20],
	});
	const encrypted = encryptGt7(plain, 0x12345678);
	assert.notEqual(Buffer.from(encrypted).readUInt32LE(0), Buffer.from(plain).readUInt32LE(0));

	const decrypted = decryptGt7(encrypted);
	assert.ok(decrypted, 'magic should match after decryption');
	const packet = parseGt7(decrypted);
	assert.equal(packet.packetId, 42);
	assert.equal(packet.gear, 4);
	assert.equal(packet.currentLap, 3);
	assert.equal(packet.lastLapMs, 91234);
	assert.ok(Math.abs(packet.speedMs - 50) < 1e-4);
	assert.ok(Math.abs(packet.throttle - 1) < 1e-6);
	assert.deepEqual(packet.tyreTemps, [81, 82, 79, 80]);
});

test('GT7 decrypt rejects data encrypted for another heartbeat variant', () => {
	const encrypted = encryptGt7(buildGt7Plain({}), 7, 'B');
	assert.equal(decryptGt7(encrypted, 'A'), null);
});

test('GT7 normalizer integrates lap distance and derives lateral G', () => {
	const normalizer = new Gt7Normalizer();
	let frame = null;
	for (let i = 0; i <= 60; i += 1) {
		frame = normalizer.push(
			parseGt7(buildGt7Plain({ speedMs: 40, angularVelocity: [0, 0.245, 0], currentLap: 1 })),
			1000 + (i * 1000) / 60,
		);
	}
	assert.ok(Math.abs(frame.lapDistance - 40) < 0.5, `distance ${frame.lapDistance}`);
	assert.ok(Math.abs(frame.gLat - 1) < 0.02, `gLat ${frame.gLat}`);
	assert.equal(frame.lapTimeMs, 1000);
});

test('GT7 normalizer skips paused packets', () => {
	const normalizer = new Gt7Normalizer();
	assert.equal(normalizer.push(parseGt7(buildGt7Plain({ isPaused: true })), 0), null);
});
