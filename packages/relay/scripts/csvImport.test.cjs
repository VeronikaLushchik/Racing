const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { isCsv, readCsv } = require('../dist/sources/fileImport/csvFile');
const { importFiles, listImports } = require('../dist/sources/fileImport/fileImport');

const RADIUS = 160;
const LAP_M = 2 * Math.PI * RADIUS;

/** A GT7-style raw log: laps around a circle at 40 m/s, 60 Hz, a refuel before lap 3. */
const gt7Csv = ({ laps = 3, startLap = 1, dropout = false } = {}) => {
	const rows = ['t_s,packet_id,lap,x_m,y_m,speed_ms,rpm,gear,throttle,brake,fuel_l,yaw_rate_dps,wheel_fl,wheel_fr,wheel_rl,wheel_rr,tyre_fl,tyre_fr,tyre_rl,tyre_rr,last_lap_ms'];
	const v = 40;
	const lapS = LAP_M / v;
	let fuel = 20;
	let last = -1;
	for (let i = 0; i < Math.round(laps * lapS * 60); i += 1) {
		if (dropout && i > 200 && i < 225) continue;
		const t = i / 60;
		const lap = Math.floor(t / lapS);
		if (lap > 0 && t - lap * lapS < 1 / 60) last = Math.round(lapS * 1000);
		if (lap === 2 && fuel < 25) fuel = 30;
		fuel -= 0.0005;
		const a = (v * t) / RADIUS;
		const yaw = ((v / RADIUS) * 180) / Math.PI;
		const omega = v / 0.34;
		rows.push(
			[t.toFixed(3), i, lap + startLap, (RADIUS * Math.sin(a)).toFixed(2), (RADIUS - RADIUS * Math.cos(a)).toFixed(2), v, 7000, 4, 255, 0, fuel.toFixed(3), yaw.toFixed(2), omega, omega, omega, omega, 85, 86, 80, 81, last].join(','),
		);
	}
	return Buffer.from(rows.join('\n'));
};

test('csv: detects tables and reads units, metadata and a units row', () => {
	assert.equal(isCsv('race.csv', Buffer.from('a,b,c\n1,2,3\n')), true);
	assert.equal(isCsv('session.json', Buffer.from('{}')), false);
	const text = [
		'Format,MoTeC CSV File',
		'Venue,Magione',
		'Vehicle,Porsche 911 GT3 R',
		'',
		'Time,Speed,Throttle Pos,Brake Pos',
		's,km/h,%,%',
		'0.00,100,50,0',
		'0.05,101,51,0',
	].join('\n');
	const table = readCsv('motec.csv', Buffer.from(text));
	assert.equal(table.track, 'Magione');
	assert.equal(table.car, 'Porsche 911 GT3 R');
	assert.equal(table.count, 2);
	assert.equal(table.channels.Speed.unit, 'km/h');
	assert.equal(table.channels['Throttle Pos'].values[1], 51);
	const bracketed = readCsv('x.csv', Buffer.from('time [s];speed [m/s];rpm\n0;10;5000\n1;11;5100\n'));
	assert.equal(bracketed.channels.speed.unit, 'm/s');
});

test('csv: a GT7 raw log becomes laps, with refuel as a pit stop and 0..255 pedals', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-'));
	const result = importFiles(dir, [{ name: 'race_gt7.csv', data: gt7Csv({ dropout: true }) }]);
	assert.equal(result.format, 'csv');
	assert.equal(result.laps, 3);
	assert.equal(result.validLaps, 3);
	assert.equal(result.pitLaps, 1);
	assert.ok(Math.abs(result.trackLength - LAP_M) < 15, `track ${result.trackLength}`);
	assert.ok(result.channels.includes('yawRate'));
	assert.ok(result.channels.includes('wheelSpeeds'));
	assert.ok(result.channels.includes('tyreTemps'));
	assert.ok(!result.channels.includes('gForce'));
	const messages = zlib
		.gunzipSync(fs.readFileSync(path.join(dir, 'sessions', result.file)))
		.toString()
		.split('\n')
		.filter(Boolean)
		.map(line => JSON.parse(line));
	const frame = messages.find(m => m.type === 'frame' && m.frame.t > 5000).frame;
	assert.equal(frame.throttle, 1);
	assert.ok(Math.abs(Math.abs(frame.gLat) - (40 * 40) / RADIUS / 9.81) < 0.05, `gLat ${frame.gLat}`);
	assert.ok(Math.abs(frame.wheelSpeeds[0] - 144) < 2);
	const pitLap = messages.filter(m => m.type === 'lap').find(m => m.lap.isPitLap).lap;
	assert.equal(pitLap.lap, 2);
	assert.equal(listImports(dir)[0].file, result.file);
});

test('csv: a single lap logged line to line with the counter at 0 counts as lap 1', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-'));
	const result = importFiles(dir, [{ name: 'best.csv', data: gt7Csv({ laps: 1, startLap: 0 }) }]);
	assert.equal(result.laps, 1);
	assert.equal(result.validLaps, 1);
});
