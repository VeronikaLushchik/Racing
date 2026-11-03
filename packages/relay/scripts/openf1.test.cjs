/** @format */

const test = require('node:test');
const assert = require('node:assert/strict');

const { OpenF1Timeline } = require('../dist/sources/openf1/openf1Timeline');

const T0 = Date.parse('2024-09-01T13:03:00Z');
const iso = ms => new Date(ms).toISOString();

/** A car going round a 1 km circle at a steady 180 km/h; 3 laps of 20 s. */
const buildBundle = () => {
	const carData = [];
	const location = [];
	const radius = 1000 / (2 * Math.PI);
	for (let ms = -5000; ms <= 61000; ms += 270) {
		carData.push({
			date: iso(T0 + ms),
			speed: 180,
			rpm: 11000,
			n_gear: 7,
			throttle: 100,
			brake: 0,
			drs: 0,
		});
	}
	for (let ms = -5000; ms <= 61000; ms += 250) {
		const angle = (2 * Math.PI * ms) / 20000;
		location.push({
			date: iso(T0 + ms),
			x: (radius * Math.cos(angle)) / 0.1,
			y: (radius * Math.sin(angle)) / 0.1,
			z: 0,
		});
	}
	const laps = [1, 2, 3].map(n => ({
		lap_number: n,
		date_start: iso(T0 + (n - 1) * 20000),
		lap_duration: 20,
		duration_sector_1: 6.5,
		duration_sector_2: 7,
		duration_sector_3: 6.5,
		is_pit_out_lap: false,
	}));
	return {
		session: {
			session_key: 1,
			year: 2024,
			country_name: 'Italy',
			session_name: 'Race',
			circuit_short_name: 'Monza',
		},
		driverNumber: 16,
		drivers: [
			{ driver_number: 16, full_name: 'Driver One', name_acronym: 'ONE' },
			{ driver_number: 4, full_name: 'Driver Two', name_acronym: 'TWO' },
		],
		carData,
		location,
		laps,
		stints: [
			{
				driver_number: 16,
				stint_number: 1,
				compound: 'MEDIUM',
				lap_start: 1,
				lap_end: 3,
				tyre_age_at_start: 2,
			},
		],
		intervals: [
			{ date: iso(T0 + 1000), driver_number: 4, gap_to_leader: null, interval: null },
			{ date: iso(T0 + 1000), driver_number: 16, gap_to_leader: 1.5, interval: 1.5 },
			{ date: iso(T0 + 30000), driver_number: 16, gap_to_leader: '+1 LAP', interval: 0.8 },
		],
		positions: [
			{ date: iso(T0), driver_number: 4, position: 1 },
			{ date: iso(T0), driver_number: 16, position: 2 },
		],
		pits: [],
	};
};

test('timeline starts at lap 1 and interpolates channels', () => {
	const timeline = new OpenF1Timeline(buildBundle());
	assert.equal(timeline.startMs, T0);
	const frame = timeline.frameAt(T0 + 25000);
	assert.equal(frame.lap, 2);
	assert.equal(frame.lapTimeMs, 5000);
	assert.ok(Math.abs(frame.speed - 180) < 1e-6);
	assert.ok(Math.abs(frame.lapDistance - 250) < 2, `distance ${frame.lapDistance}`);
	assert.equal(frame.throttle, 1);
	assert.equal(frame.position, 2);
});

test('timeline derives lateral G from heading change', () => {
	const timeline = new OpenF1Timeline(buildBundle());
	// v = 50 m/s on r = 159 m → 1.6 G; counter-clockwise circle = left turn = negative.
	const g = timeline.frameAt(T0 + 10000).gLat;
	assert.ok(Math.abs(g + 1.6) < 0.1, `gLat ${g}`);
});

test('timeline emits finished laps with sectors and compound', () => {
	const timeline = new OpenF1Timeline(buildBundle());
	const laps = timeline.lapsFinishedBetween(T0 + 19000, T0 + 21000);
	assert.equal(laps.length, 1);
	assert.equal(laps[0].lap, 1);
	assert.deepEqual(laps[0].sectorsMs, [6500, 7000, 6500]);
	assert.equal(laps[0].compound, 'MEDIUM');
	assert.equal(laps[0].isValid, false, 'lap 1 includes the standing start');
	assert.ok(Math.abs(timeline.trackLength - 1000) < 5, `track ${timeline.trackLength}`);
});

test('field sorts by position and ignores non-numeric gaps', () => {
	const timeline = new OpenF1Timeline(buildBundle());
	const field = timeline.fieldAt(T0 + 35000);
	assert.deepEqual(
		field.map(e => e.name),
		['TWO', 'ONE'],
	);
	assert.equal(field[1].gapToLeaderS, null);
	assert.equal(field[1].intervalS, 0.8);
	assert.equal(field[1].tyreAgeLaps, 3);
	assert.equal(field[1].isPlayer, true);
});
