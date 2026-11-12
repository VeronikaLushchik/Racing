const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { importFiles } = require('../dist/sources/fileImport/fileImport');
const { parseMultipart } = require('../dist/server/multipartBody');

const CHANNELS = [
	{ key: 'tRel', type: 'u32', scale: 1, unit: 'ms' },
	{ key: 'lapIndex', type: 'u16', scale: 1, unit: '' },
	{ key: 'lapMs', type: 'u32', scale: 1, unit: 'ms' },
	{ key: 'lapNorm', type: 'f32', scale: 1, unit: '' },
	{ key: 'throttle', type: 'u16', scale: 65535, unit: '' },
	{ key: 'brake', type: 'u16', scale: 65535, unit: '' },
	{ key: 'steer', type: 'i16', scale: 32767, unit: '' },
	{ key: 'speedKmh', type: 'u16', scale: 10, unit: 'km/h' },
	{ key: 'rpm', type: 'u16', scale: 1, unit: 'rpm' },
	{ key: 'gear', type: 'i8', scale: 1, unit: '' },
	{ key: 'posX', type: 'f32', scale: 1, unit: 'm' },
	{ key: 'posZ', type: 'f32', scale: 1, unit: 'm' },
	{ key: 'accLat', type: 'f32', scale: 1, unit: 'g' },
	{ key: 'accLong', type: 'f32', scale: 1, unit: 'g' },
];
const SIZES = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4 };
const FRAME_BYTES = CHANNELS.reduce((sum, c) => sum + SIZES[c.type], 0);

/**
 * A car going round a 1000 m circle clockwise seen from above (right-hand corner, steer > 0)
 * at 36 m/s, sampled at 60 Hz: starts mid-lap, then three full laps. Like Assetto Corsa, the lap
 * timer keeps running for two samples after the line before it resets. `startShare` is where in
 * the lap the recording starts.
 */
const buildRecording = (startShare = 0.5) => {
	const radius = 1000 / (2 * Math.PI);
	const dtMs = 1000 / 60;
	const lapMs = (1000 / 36) * 1000;
	const rows = [];
	let lapStartT = -lapMs * startShare;
	for (let i = 0; ; i += 1) {
		const tMs = i * dtMs;
		const norm = (tMs - lapStartT) / lapMs;
		const lapIndex = Math.floor((tMs + lapMs * startShare) / lapMs);
		if (lapIndex > 3) break;
		const angle = ((tMs + lapMs * startShare) / lapMs) * 2 * Math.PI;
		const heldMs = lapIndex > 0 && norm % 1 < 2 / (lapMs / dtMs) ? lapMs : 0;
		rows.push({
			tRel: Math.round(tMs),
			lapIndex,
			lapMs: Math.round(((tMs + lapMs * startShare) % lapMs) + heldMs),
			lapNorm: ((tMs + lapMs * startShare) / lapMs) % 1,
			throttle: 0.8,
			brake: 0,
			steer: 0.2,
			speedKmh: 36 * 3.6,
			rpm: 6000,
			gear: 4,
			// Clockwise in X/Z with a right-handed cross product → the importer mirrors Z.
			posX: radius * Math.cos(angle),
			posZ: radius * Math.sin(angle),
			accLat: 36 ** 2 / radius / 9.81,
			accLong: 0,
		});
	}
	const frames = Buffer.alloc(24 + rows.length * FRAME_BYTES);
	frames.write('RTLG', 0, 'latin1');
	frames.writeUInt16LE(1, 4);
	frames.writeUInt16LE(FRAME_BYTES, 6);
	frames.writeDoubleLE(1794333713883, 8);
	rows.forEach((row, i) => {
		let offset = 24 + i * FRAME_BYTES;
		CHANNELS.forEach(channel => {
			const raw = row[channel.key] * channel.scale;
			const write = {
				u8: () => frames.writeUInt8(Math.round(raw), offset),
				i8: () => frames.writeInt8(Math.round(raw), offset),
				u16: () => frames.writeUInt16LE(Math.round(raw), offset),
				i16: () => frames.writeInt16LE(Math.round(raw), offset),
				u32: () => frames.writeUInt32LE(Math.round(raw), offset),
				f32: () => frames.writeFloatLE(raw, offset),
			}[channel.type];
			write();
			offset += SIZES[channel.type];
		});
	});
	const session = {
		formatVersion: 2,
		id: '2026-11-10T18-01-53_ac_test-circle',
		source: 'ac',
		car: 'test_car',
		track: 'circle / circle',
		frameCount: rows.length,
		frameBytes: FRAME_BYTES,
		trackLengthM: null,
		channels: CHANNELS,
	};
	return { frames, session: Buffer.from(JSON.stringify(session)) };
};

const readRecording = (dataDir, file) =>
	zlib
		.gunzipSync(fs.readFileSync(path.join(dataDir, 'sessions', file)))
		.toString('utf8')
		.trim()
		.split('\n')
		.map(line => JSON.parse(line));

test('recorder session (session.json + frames.bin) becomes a replayable recording', () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-import-'));
	const { frames, session } = buildRecording();
	const result = importFiles(dataDir, [
		{ name: 'frames.bin', data: frames },
		{ name: 'session.json', data: session },
	]);

	assert.equal(result.format, 'rtlg');
	assert.equal(result.title, 'Assetto Corsa · circle · test_car');
	assert.ok(Math.abs(result.trackLength - 1000) < 5, `track ${result.trackLength}`);
	assert.deepEqual(result.notes, ['trackLengthEstimated', 'mapMirrored']);

	const messages = readRecording(dataDir, result.file);
	assert.equal(messages[0].type, 'session');
	assert.equal(messages[0].session.capabilities.hasMeasuredG, true);
	const laps = messages.filter(m => m.type === 'lap').map(m => m.lap);
	// Lap 0 is the run to the line, not a lap; lap 3 ends with the file but is complete.
	assert.deepEqual(
		laps.map(lap => lap.lap),
		[1, 2, 3],
	);
	laps.forEach(lap => {
		assert.equal(lap.isValid, true);
		assert.ok(Math.abs(lap.lapTimeMs - 27778) < 40, `lap time ${lap.lapTimeMs}`);
		assert.equal(lap.sectorsMs.length, 3);
	});

	const frameList = messages.filter(m => m.type === 'frame').map(m => m.frame);
	// The held lap timer right after the line must not leak into the new lap.
	const firstOfLap2 = frameList.filter(f => f.lap === 2).slice(0, 4);
	firstOfLap2.forEach(f => assert.ok(f.lapTimeMs < 100, `lapTimeMs ${f.lapTimeMs}`));
	// Right-hand corner after mirroring: clockwise in the dashboard's X/Z (negative cross).
	const [a, b, c] = [frameList[100], frameList[110], frameList[120]];
	const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
	assert.ok(cross < 0);
});

test('missing half of a recorder session is reported by key', () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-import-'));
	const { frames, session } = buildRecording();
	assert.throws(() => importFiles(dataDir, [{ name: 'frames.bin', data: frames }]), {
		messageKey: 'importMissingSession',
	});
	assert.throws(() => importFiles(dataDir, [{ name: 'session.json', data: session }]), {
		messageKey: 'importMissingFrames',
	});
	assert.throws(
		() => importFiles(dataDir, [{ name: 'notes.txt', data: Buffer.from('hello') }]),
		{ messageKey: 'importUnknownFormat' },
	);
});

test('relay recording is imported as it is', () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-import-'));
	const lines = [
		{ type: 'session', session: { sessionId: 'gt7-1', title: 'Gran Turismo 7 (live)' } },
		{ type: 'lap', lap: { lap: 1, lapTimeMs: 90000, isValid: true } },
	];
	const data = zlib.gzipSync(lines.map(line => JSON.stringify(line)).join('\n'));
	const result = importFiles(dataDir, [{ name: 'gt7-1.ndjson.gz', data }]);
	assert.equal(result.format, 'relay');
	assert.equal(result.bestLapMs, 90000);
	assert.equal(readRecording(dataDir, result.file).length, 2);
});

test('multipart body is split into files', () => {
	const boundary = '----racing';
	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.json"\r\n` +
				'Content-Type: application/json\r\n\r\n{"x":1}\r\n',
		),
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="b.bin"\r\n\r\n`,
		),
		Buffer.from([0, 13, 10, 255]),
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
	const files = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
	assert.deepEqual(
		files.map(file => file.name),
		['a.json', 'b.bin'],
	);
	assert.equal(files[0].data.toString(), '{"x":1}');
	assert.deepEqual([...files[1].data], [0, 13, 10, 255]);
});

test('restarts that move the lap counter are not laps (GT7 without a lap position)', () => {
	const channels = [
		{ key: 'tRel', type: 'u32', scale: 1, unit: 'ms' },
		{ key: 'lapIndex', type: 'u16', scale: 1, unit: '' },
		{ key: 'speedKmh', type: 'u16', scale: 10, unit: 'km/h' },
		{ key: 'posX', type: 'f32', scale: 1, unit: 'm' },
		{ key: 'posZ', type: 'f32', scale: 1, unit: 'm' },
	];
	const frameBytes = 4 + 2 + 2 + 4 + 4;
	const radius = 1000 / (2 * Math.PI);
	const lapMs = (1000 / 36) * 1000;
	// Lap 0 runs to the line, lap 1 is a 3 s restart, laps 2 and 3 are full, lap 4 is cut.
	const plan = [
		[0, 10000],
		[1, 3000],
		[2, lapMs],
		[3, lapMs],
		[4, 5000],
	];
	const rows = [];
	let t = 0;
	plan.forEach(([lap, duration]) => {
		for (let local = 0; local < duration; local += 1000 / 60) {
			const angle = (local / lapMs) * 2 * Math.PI;
			rows.push([t, lap, 36 * 3.6, radius * Math.cos(angle), radius * Math.sin(angle)]);
			t += 1000 / 60;
		}
	});
	const frames = Buffer.alloc(24 + rows.length * frameBytes);
	frames.write('RTLG', 0, 'latin1');
	frames.writeUInt16LE(1, 4);
	frames.writeUInt16LE(frameBytes, 6);
	rows.forEach(([time, lap, speed, x, z], i) => {
		const offset = 24 + i * frameBytes;
		frames.writeUInt32LE(Math.round(time), offset);
		frames.writeUInt16LE(lap, offset + 4);
		frames.writeUInt16LE(Math.round(speed * 10), offset + 6);
		frames.writeFloatLE(x, offset + 8);
		frames.writeFloatLE(z, offset + 12);
	});
	const session = { formatVersion: 1, source: 'gt7', frameBytes, channels };
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-import-'));
	const result = importFiles(dataDir, [
		{ name: 'frames.bin', data: frames },
		{ name: 'session.json', data: Buffer.from(JSON.stringify(session)) },
	]);
	const laps = readRecording(dataDir, result.file)
		.filter(m => m.type === 'lap')
		.map(m => m.lap);
	assert.deepEqual(
		laps.filter(lap => lap.isValid).map(lap => lap.lap),
		[2, 3],
	);
	assert.ok(Math.abs(result.bestLapMs - lapMs) < 100, `best ${result.bestLapMs}`);
});

test('a recording that starts on the line counts its first lap', () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-import-'));
	const { frames, session } = buildRecording(0);
	const result = importFiles(dataDir, [
		{ name: 'frames.bin', data: frames },
		{ name: 'session.json', data: session },
	]);
	const laps = readRecording(dataDir, result.file)
		.filter(m => m.type === 'lap')
		.map(m => m.lap);
	assert.deepEqual(
		laps.map(lap => lap.lap),
		[1, 2, 3, 4],
	);
	laps.forEach(lap => assert.equal(lap.isValid, true));
});
