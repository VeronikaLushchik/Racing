import {
	TImportNote,
	TLapSummary,
	TServerMessage,
	TSessionInfo,
	TTelemetryFrame,
	TTyreZones,
	TWheelTuple,
} from '@racing/shared';

import { ImportError, TChannel, TChannelTable, TImportedSession } from './importTypings';

const G = 9.81;
/** Frames closer than this are dropped; the relay streams at most 60 Hz anyway. */
const MIN_FRAME_GAP_MS = 15;
/** Pauses longer than this are cut out so a replay does not stand still. */
const MAX_FRAME_GAP_MS = 100;
/** A gap this long, or a jump this far, means the game paused, reset or teleported the car. */
const BREAK_GAP_MS = 500;
const BREAK_JUMP_M = 30;
const BREAK_NORM_JUMP = 0.05;
const SECTOR_COUNT = 3;
const SMOOTHING = 0.25;

const ORIGIN_NAMES: Record<string, string> = {
	ac: 'Assetto Corsa',
	acc: 'Assetto Corsa Competizione',
	gt7: 'Gran Turismo 7',
};

const WHEELS = ['fl', 'fr', 'rl', 'rr'];
const WHEEL_ALIASES: Record<string, string[]> = {
	fl: ['fl', 'lf', 'frontleft'],
	fr: ['fr', 'rf', 'frontright'],
	rl: ['rl', 'lr', 'rearleft'],
	rr: ['rr', 'rearright'],
};

/** Channel names this importer understands, compared lowercased without separators. */
const ALIASES = {
	time: ['trel', 'timems', 'sessiontimems', 'time', 'timestamp', 'sessiontime'],
	speedKmh: ['speedkmh', 'speedkph', 'speed', 'groundspeed', 'carspeed'],
	speedMs: ['speedms', 'speedmps'],
	rpm: ['rpm', 'rpms', 'enginerpm'],
	gear: ['gear', 'currentgear'],
	throttle: ['throttle', 'gas', 'throttlepos', 'throttleposition'],
	brake: ['brake', 'brakepos', 'brakeposition'],
	steer: ['steer', 'steering', 'steerangledeg', 'steerangle', 'steeringangle'],
	gLat: ['acclat', 'glat', 'lateralg', 'accellateral', 'cgaccellateral'],
	gLong: ['acclong', 'glong', 'glon', 'longitudinalg', 'accellongitudinal'],
	x: ['posx', 'positionx', 'carcoordx', 'worldx', 'x'],
	z: ['posz', 'positionz', 'carcoordz', 'worldz', 'z'],
	lap: ['lapindex', 'lap', 'lapnumber', 'currentlap'],
	lapMs: ['lapms', 'laptimems', 'currentlapms', 'laptime', 'currentlaptime'],
	lastLapMs: ['lastlapms', 'lastlaptimems', 'lastlap'],
	lapNorm: ['lapnorm', 'carposnorm', 'normalizedcarposition', 'splineposition'],
	fuel: ['fuel', 'fuellevel', 'fuell'],
	position: ['raceposition', 'position', 'place'],
	waterTemp: ['watertemp', 'coolanttemp', 'watertempc'],
	oilTemp: ['oiltemp', 'oiltempc'],
};

const WHEEL_BASES = {
	tyreTemps: ['tyretemp', 'tiretemp', 'tyrecoretemp', 'tyretempcore', 'tyretempc'],
	tyreInner: ['tyretempinner', 'tyretempi', 'tiretempinner'],
	tyreMiddle: ['tyretempmiddle', 'tyretempm', 'tiretempmiddle'],
	tyreOuter: ['tyretempouter', 'tyretempo', 'tiretempouter'],
	brakeTemps: ['braketemp', 'brakedisctemp', 'braketempc'],
	tyreWear: ['tyrewear', 'tirewear'],
	wheelSpeeds: ['wheelspeed', 'wheelspeedkmh'],
	wheelAngular: ['wheelangularspeed', 'wheelrps', 'wheelspin'],
	tyreRadius: ['tyreradius', 'tireradius', 'wheelradius'],
	slipRatio: ['slipratio'],
	suspension: ['suspensionheight', 'rideheight'],
};

const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

type TLookup = Map<string, TChannel>;

const findNamed = (lookup: TLookup, aliases: string[]): [string, TChannel] | null => {
	const alias = aliases.find(name => lookup.has(name));
	return alias ? [alias, lookup.get(alias) as TChannel] : null;
};

const find = (lookup: TLookup, aliases: string[]): TChannel | null =>
	findNamed(lookup, aliases)?.[1] ?? null;

const findWheels = (lookup: TLookup, bases: string[]): TWheelTuple<TChannel> | null => {
	for (const base of bases) {
		const wheels = WHEELS.map(wheel =>
			WHEEL_ALIASES[wheel]
				.flatMap(suffix => [`${base}${suffix}`, `${suffix}${base}`])
				.map(name => lookup.get(name))
				.find(Boolean),
		);
		if (wheels.every(Boolean)) return wheels as TWheelTuple<TChannel>;
	}
	return null;
};

const unitOf = (channel: TChannel): string => channel.unit.toLowerCase().replace(/\s/g, '');

const maxAbs = (values: Float64Array): number =>
	values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

const median = (values: number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/** Converts a column to the frame's units; returns a function of the sample index. */
const reader = (channel: TChannel | null, factor = 1): ((i: number) => number) | null =>
	channel ? (i: number) => channel.values[i] * factor : null;

const timeFactor = (channel: TChannel, name: string): number => {
	const unit = unitOf(channel);
	if (unit === 's' || unit === 'sec') return 1000;
	if (unit === 'us' || unit === 'µs') return 0.001;
	if (unit === 'ms' || name.endsWith('ms') || name === 'trel') return 1;
	return 1000;
};

const speedFactor = (channel: TChannel, defaultUnit: 'km/h' | 'm/s'): number => {
	const unit = unitOf(channel) || defaultUnit;
	if (unit === 'm/s') return 3.6;
	if (unit === 'mph') return 1.609344;
	return 1;
};

const gFactor = (channel: TChannel): number => {
	const unit = unitOf(channel);
	return unit.startsWith('m/s') || maxAbs(channel.values) > 8 ? 1 / G : 1;
};

const pedalFactor = (channel: TChannel): number =>
	unitOf(channel) === '%' || maxAbs(channel.values) > 1.5 ? 0.01 : 1;

const wheelTuple = (
	wheels: TWheelTuple<TChannel> | null,
	i: number,
	factor = 1,
): TWheelTuple<number> | null =>
	wheels ? (wheels.map(wheel => wheel.values[i] * factor) as TWheelTuple<number>) : null;

const originName = (origin: string | null): string =>
	(origin && ORIGIN_NAMES[origin.toLowerCase()]) || origin || 'Recorded session';

/** "magione / magione" → "magione"; "ks_nordschleife / endurance" stays as it is. */
const trackName = (track: string | null): string | null => {
	if (!track) return null;
	const parts = track.split('/').map(part => part.trim());
	return parts.length === 2 && parts[0] === parts[1] ? parts[0] : track;
};

interface TLapSpan {
	lap: number;
	start: number;
	/** Index after the last sample of the lap. */
	end: number;
	isBroken: boolean;
}

/**
 * Turns the columns of a recorded file into the messages a live source would have sent:
 * the session, ~60 Hz frames and a lap summary at every line crossing. The result is written
 * as a normal relay recording, so the replay source plays it into every dashboard view.
 */
export const buildImportedSession = (table: TChannelTable, sessionId: string): TImportedSession => {
	const lookup: TLookup = new Map(
		Object.entries(table.channels).map(([name, channel]) => [normalizeName(name), channel]),
	);
	const n = table.count;
	const notes: TImportNote[] = [];

	const speedKmhChannel = find(lookup, ALIASES.speedKmh);
	const speedMsChannel = find(lookup, ALIASES.speedMs);
	const speedOf = speedKmhChannel
		? reader(speedKmhChannel, speedFactor(speedKmhChannel, 'km/h'))
		: reader(speedMsChannel, speedMsChannel ? speedFactor(speedMsChannel, 'm/s') : 1);
	if (!speedOf) throw new ImportError('importNoSpeed');
	if (n < 2) throw new ImportError('importEmpty');

	// Session clock without pauses.
	const timeColumn = findNamed(lookup, ALIASES.time);
	const timeScale = timeColumn ? timeFactor(timeColumn[1], timeColumn[0]) : 1;
	const rawTime = (i: number): number =>
		timeColumn ? timeColumn[1].values[i] * timeScale : (i * 1000) / 60;
	const t = new Float64Array(n);
	const rawGap = new Float64Array(n);
	for (let i = 1; i < n; i += 1) {
		rawGap[i] = rawTime(i) - rawTime(i - 1);
		t[i] = t[i - 1] + Math.min(MAX_FRAME_GAP_MS, Math.max(0, rawGap[i]));
	}

	const lapChannel = find(lookup, ALIASES.lap);
	const lapNorm = find(lookup, ALIASES.lapNorm);
	const lapMsColumn = findNamed(lookup, ALIASES.lapMs);
	const lapMsOf = lapMsColumn
		? reader(lapMsColumn[1], timeFactor(lapMsColumn[1], lapMsColumn[0]))
		: null;
	const lastLapColumn = findNamed(lookup, ALIASES.lastLapMs);
	const lastLapScale = lastLapColumn ? timeFactor(lastLapColumn[1], lastLapColumn[0]) : 1;
	const xChannel = find(lookup, ALIASES.x);
	const zChannel = find(lookup, ALIASES.z);

	// Laps: the recorder's lap counter, else wraps of the lap position, else one lap.
	const lapOf = new Int32Array(n);
	if (lapChannel) {
		for (let i = 0; i < n; i += 1) lapOf[i] = Math.max(0, Math.round(lapChannel.values[i]));
	} else if (lapNorm) {
		let lap = lapNorm.values[0] > BREAK_NORM_JUMP ? 0 : 1;
		for (let i = 0; i < n; i += 1) {
			if (i > 0 && lapNorm.values[i - 1] - lapNorm.values[i] > 0.5) lap += 1;
			lapOf[i] = lap;
		}
	} else {
		lapOf.fill(1);
	}

	const spans: TLapSpan[] = [];
	for (let i = 0; i < n; i += 1) {
		const last = spans[spans.length - 1];
		if (!last || last.lap !== lapOf[i]) {
			spans.push({ lap: lapOf[i], start: i, end: i + 1, isBroken: false });
			continue;
		}
		last.end = i + 1;
		const jump =
			xChannel && zChannel
				? Math.hypot(
						xChannel.values[i] - xChannel.values[i - 1],
						zChannel.values[i] - zChannel.values[i - 1],
					)
				: 0;
		const normJump = lapNorm ? Math.abs(lapNorm.values[i] - lapNorm.values[i - 1]) : 0;
		if (rawGap[i] > BREAK_GAP_MS || jump > BREAK_JUMP_M || normJump > BREAK_NORM_JUMP) {
			last.isBroken = true;
		}
	}

	// Distance driven within each lap, integrated from speed.
	const driven = new Float64Array(n);
	spans.forEach(span => {
		for (let i = span.start + 1; i < span.end; i += 1) {
			const dt = (t[i] - t[i - 1]) / 1000;
			driven[i] = driven[i - 1] + (((speedOf(i) + speedOf(i - 1)) / 2) * dt) / 3.6;
		}
	});

	// A lap counts when it was seen from line to line without a reset. Without a lap position
	// the first and the last laps of a file are assumed to be cut, unless the file is one lap.
	const isWholeLap = (span: TLapSpan, index: number): boolean =>
		span.lap > 0 &&
		!span.isBroken &&
		(lapNorm
			? lapNorm.values[span.start] < BREAK_NORM_JUMP &&
				lapNorm.values[span.end - 1] > 1 - BREAK_NORM_JUMP
			: spans.length === 1 || (index > 0 && index < spans.length - 1));

	let trackLength = table.trackLength && table.trackLength > 0 ? table.trackLength : null;
	if (!trackLength) {
		const lengths = spans.filter(isWholeLap).map(span => driven[span.end - 1]);
		const estimate = median(lengths);
		trackLength = estimate && estimate > 200 ? Math.round(estimate) : null;
		if (trackLength) notes.push('trackLengthEstimated');
	}

	const lapDistance = new Float64Array(n);
	for (let i = 0; i < n; i += 1) {
		lapDistance[i] =
			lapNorm && trackLength ? Math.max(0, lapNorm.values[i]) * trackLength : driven[i];
	}

	// Time within the lap. Some games keep the old lap timer running for a few samples after
	// the line, so the recorder's lap timer is used only once it has reset.
	const lapTime = new Float64Array(n);
	const pitLaps = new Set<TLapSpan>();
	spans.forEach(span => {
		let isHeld = false;
		if (lapMsOf && span.start > 0) {
			for (let i = span.start + 1; i < Math.min(span.end, span.start + 15); i += 1) {
				if (lapMsOf(i) < lapMsOf(i - 1)) isHeld = true;
			}
		}
		// A timer already running at the line without a reset was started in the pit lane.
		if (lapMsOf && span.start > 0 && !isHeld && lapMsOf(span.start) > 500) pitLaps.add(span);
		let hasReset = !isHeld;
		for (let i = span.start; i < span.end; i += 1) {
			if (!hasReset && i > span.start && lapMsOf && lapMsOf(i) < lapMsOf(i - 1)) {
				hasReset = true;
			}
			lapTime[i] = lapMsOf && hasReset ? lapMsOf(i) : t[i] - t[span.start];
		}
	});

	// Official lap time: the game's last-lap value, else its lap timer at the line.
	const lapTimeAtLine = (span: TLapSpan, next: TLapSpan | undefined): number => {
		const b = next ? next.start : span.end - 1;
		if (next && lastLapColumn) {
			const values = lastLapColumn[1].values;
			for (let i = b; i < Math.min(n, b + 60); i += 1) {
				if (values[i] !== values[b - 1] && values[i] > 0) return values[i] * lastLapScale;
			}
		}
		if (next && lapMsOf) {
			const a = b - 1;
			if (lapMsOf(b) >= lapMsOf(a)) {
				const before = lapNorm ? 1 - lapNorm.values[a] : 0;
				const after = lapNorm ? lapNorm.values[b] : 0;
				const share = before + after > 0 ? before / (before + after) : 0;
				return lapMsOf(a) + share * (lapMsOf(b) - lapMsOf(a));
			}
			return lapMsOf(a);
		}
		return t[b] - t[span.start];
	};

	const summaries = new Map<number, TLapSummary>();
	spans.forEach((span, index) => {
		const next = spans[index + 1];
		if (!isWholeLap(span, index)) {
			// Laps cut short by a reset to the pits still show up in the table, as invalid ones.
			if (span.lap > 0 && next) {
				summaries.set(span.end, {
					lap: span.lap,
					lapTimeMs: Math.round(t[next.start] - t[span.start]),
					sectorsMs: [],
					isValid: false,
					isPitLap: span.isBroken || pitLaps.has(span),
					compound: null,
				});
			}
			return;
		}
		const lapTimeMs = lapTimeAtLine(span, next);
		const sectorsMs: number[] = [];
		if (trackLength) {
			const starts = [0];
			for (let i = span.start; i < span.end && starts.length < SECTOR_COUNT; i += 1) {
				if (lapDistance[i] >= (trackLength / SECTOR_COUNT) * starts.length) {
					starts.push(lapTime[i]);
				}
			}
			if (starts.length === SECTOR_COUNT) {
				[...starts, lapTimeMs].forEach((value, i, all) => {
					if (i > 0) sectorsMs.push(Math.round(value - all[i - 1]));
				});
			}
		}
		summaries.set(span.end, {
			lap: span.lap,
			lapTimeMs: Math.round(lapTimeMs),
			sectorsMs,
			isValid: true,
			isPitLap: pitLaps.has(span),
			compound: null,
		});
	});

	// Measured G, else derived from speed and heading.
	const gLatChannel = find(lookup, ALIASES.gLat);
	const gLongChannel = find(lookup, ALIASES.gLong);
	const gLatOf = reader(gLatChannel, gLatChannel ? gFactor(gLatChannel) : 1);
	const gLongOf = reader(gLongChannel, gLongChannel ? gFactor(gLongChannel) : 1);
	const steerChannel = find(lookup, ALIASES.steer);
	const steerScale = steerChannel ? Math.max(1, maxAbs(steerChannel.values)) : 1;

	// World position. The dashboard draws X/Z so that a right-hand corner (steer > 0) turns
	// clockwise; recorders with the other handedness get Z mirrored.
	const x = new Float64Array(n);
	const z = new Float64Array(n);
	if (xChannel && zChannel) {
		x.set(xChannel.values);
		z.set(zChannel.values);
		const turnOf = gLatOf ?? reader(steerChannel, 1);
		if (turnOf) {
			let agree = 0;
			for (let i = 10; i < n - 10; i += 10) {
				if (speedOf(i) < 40 || Math.abs(turnOf(i)) < 0.05) continue;
				const cross =
					(x[i] - x[i - 10]) * (z[i + 10] - z[i]) -
					(z[i] - z[i - 10]) * (x[i + 10] - x[i]);
				agree += Math.sign(cross) === Math.sign(turnOf(i)) ? 1 : -1;
			}
			if (agree > 0) {
				for (let i = 0; i < n; i += 1) z[i] = -z[i];
				notes.push('mapMirrored');
			}
		}
	} else {
		// Dead reckoning from speed and lateral G; enough to draw a recognisable track.
		let heading = 0;
		for (let i = 1; i < n; i += 1) {
			const v = speedOf(i) / 3.6;
			const dt = (t[i] - t[i - 1]) / 1000;
			if (v > 3 && gLatOf) heading -= ((gLatOf(i) * G) / v) * dt;
			x[i] = x[i - 1] + Math.cos(heading) * v * dt;
			z[i] = z[i - 1] + Math.sin(heading) * v * dt;
		}
		notes.push('positionEstimated');
	}

	// Wheel speeds: recorded, or wheel spin × tyre radius (radius measured when not slipping).
	const wheelSpeeds = findWheels(lookup, WHEEL_BASES.wheelSpeeds);
	const wheelAngular = findWheels(lookup, WHEEL_BASES.wheelAngular);
	const tyreRadius = findWheels(lookup, WHEEL_BASES.tyreRadius);
	const slipRatio = findWheels(lookup, WHEEL_BASES.slipRatio);
	let radius: number[] | null = null;
	if (!wheelSpeeds && wheelAngular && !tyreRadius) {
		const estimates = wheelAngular.map((wheel, w) => {
			const samples: number[] = [];
			for (let i = 0; i < n; i += 7) {
				const omega = Math.abs(wheel.values[i]);
				const isRolling = !slipRatio || Math.abs(slipRatio[w].values[i]) < 0.03;
				if (speedOf(i) > 40 && omega > 1 && isRolling) {
					samples.push(speedOf(i) / 3.6 / omega);
				}
			}
			return median(samples);
		});
		radius = estimates.every(value => value && value > 0.15 && value < 0.6)
			? (estimates as number[])
			: null;
	}
	const wheelSpeedsOf = (i: number): TWheelTuple<number> | null => {
		if (wheelSpeeds) return wheelTuple(wheelSpeeds, i, speedFactor(wheelSpeeds[0], 'km/h'));
		if (!wheelAngular || !(tyreRadius || radius)) return null;
		return wheelAngular.map(
			(wheel, w) =>
				Math.abs(wheel.values[i]) *
				(tyreRadius ? tyreRadius[w].values[i] : (radius as number[])[w]) *
				3.6,
		) as TWheelTuple<number>;
	};

	const tyreTemps = findWheels(lookup, WHEEL_BASES.tyreTemps);
	const zoneChannels = [
		findWheels(lookup, WHEEL_BASES.tyreInner),
		findWheels(lookup, WHEEL_BASES.tyreMiddle),
		findWheels(lookup, WHEEL_BASES.tyreOuter),
	];
	const hasZones = zoneChannels.every(Boolean);
	const brakeTemps = findWheels(lookup, WHEEL_BASES.brakeTemps);
	const tyreWear = findWheels(lookup, WHEEL_BASES.tyreWear);
	const wearFactor = tyreWear && maxAbs(tyreWear[0].values) > 1.5 ? 0.01 : 1;
	const suspension = findWheels(lookup, WHEEL_BASES.suspension);

	const rpmOf = reader(find(lookup, ALIASES.rpm));
	const gearOf = reader(find(lookup, ALIASES.gear));
	const throttleChannel = find(lookup, ALIASES.throttle);
	const brakeChannel = find(lookup, ALIASES.brake);
	const throttleOf = reader(throttleChannel, throttleChannel ? pedalFactor(throttleChannel) : 1);
	const brakeOf = reader(brakeChannel, brakeChannel ? pedalFactor(brakeChannel) : 1);
	const fuelOf = reader(find(lookup, ALIASES.fuel));
	const positionOf = reader(find(lookup, ALIASES.position));
	const waterOf = reader(find(lookup, ALIASES.waterTemp));
	const oilOf = reader(find(lookup, ALIASES.oilTemp));

	const session: TSessionInfo = {
		sessionId,
		source: table.origin?.toLowerCase() === 'gt7' ? 'gt7' : 'replay',
		title: [originName(table.origin), trackName(table.track), table.car]
			.filter(Boolean)
			.join(' · '),
		track: trackName(table.track),
		driver: null,
		trackLength,
		capabilities: {
			isLive: false,
			hasSteering: steerChannel !== null,
			hasTyreTemps: tyreTemps !== null || hasZones,
			hasTyreZones: hasZones,
			hasBrakeTemps: brakeTemps !== null,
			hasTyreWear: tyreWear !== null,
			hasFuel: fuelOf !== null,
			hasSectors: trackLength !== null,
			hasOpponents: false,
			hasMeasuredG: gLatOf !== null && gLongOf !== null,
			hasWheelSpeeds: wheelSpeeds !== null || radius !== null || tyreRadius !== null,
			hasSuspension: suspension !== null,
			hasEngineTemps: waterOf !== null || oilOf !== null,
		},
	};

	const messages: TServerMessage[] = [{ type: 'session', session }];
	let frames = 0;
	let lastKeptT = -Infinity;
	let derivedLong = 0;
	let derivedLat = 0;
	for (let i = 0; i < n; i += 1) {
		const summary = summaries.get(i);
		const isLapStart = i === 0 || lapOf[i] !== lapOf[i - 1];
		if (i > 0 && !gLongOf) {
			const dt = (t[i] - t[i - 1]) / 1000;
			if (dt > 0) {
				const raw = (speedOf(i) - speedOf(i - 1)) / 3.6 / dt / G;
				derivedLong += (raw - derivedLong) * SMOOTHING;
			}
		}
		if (i > 1 && !gLatOf && dtOk(t, i)) {
			const h1 = Math.atan2(z[i - 1] - z[i - 2], x[i - 1] - x[i - 2]);
			const h2 = Math.atan2(z[i] - z[i - 1], x[i] - x[i - 1]);
			const turn = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
			const raw = -((speedOf(i) / 3.6) * turn) / ((t[i] - t[i - 1]) / 1000) / G;
			derivedLat += (Math.max(-5, Math.min(5, raw)) - derivedLat) * SMOOTHING;
		}

		if (!isLapStart && !summary && t[i] - lastKeptT < MIN_FRAME_GAP_MS) continue;
		lastKeptT = t[i];

		const frame: TTelemetryFrame = {
			t: Math.round(t[i]),
			lap: lapOf[i],
			lapTimeMs: Math.round(lapTime[i]),
			lapDistance: lapDistance[i],
			speed: speedOf(i),
			rpm: rpmOf ? Math.round(rpmOf(i)) : 0,
			gear: gearOf ? Math.round(gearOf(i)) : 0,
			throttle: throttleOf ? clamp01(throttleOf(i)) : 0,
			brake: brakeOf ? clamp01(brakeOf(i)) : 0,
			steer: steerChannel ? steerChannel.values[i] / steerScale : null,
			gLat: gLatOf ? gLatOf(i) : derivedLat,
			gLong: gLongOf ? gLongOf(i) : derivedLong,
			x: x[i],
			z: z[i],
			tyreTemps: tyreTemps
				? wheelTuple(tyreTemps, i)
				: hasZones
					? (WHEELS.map(
							(_, w) =>
								zoneChannels.reduce(
									(sum, zone) =>
										sum + (zone as TWheelTuple<TChannel>)[w].values[i],
									0,
								) / 3,
						) as TWheelTuple<number>)
					: null,
			tyreZones: hasZones
				? (WHEELS.map((_, w): TTyreZones => ({
						inner: (zoneChannels[0] as TWheelTuple<TChannel>)[w].values[i],
						middle: (zoneChannels[1] as TWheelTuple<TChannel>)[w].values[i],
						outer: (zoneChannels[2] as TWheelTuple<TChannel>)[w].values[i],
					})) as TWheelTuple<TTyreZones>)
				: null,
			brakeTemps: wheelTuple(brakeTemps, i),
			tyreWear: wheelTuple(tyreWear, i, wearFactor),
			fuel: fuelOf ? fuelOf(i) : null,
			position: positionOf && positionOf(i) > 0 ? Math.round(positionOf(i)) : null,
			wheelSpeeds: wheelSpeedsOf(i),
			suspension: wheelTuple(suspension, i),
			waterTemp: waterOf ? waterOf(i) : null,
			oilTemp: oilOf ? oilOf(i) : null,
		};
		messages.push({ type: 'frame', frame });
		frames += 1;
		// Like a live source: the summary of lap N follows the first frame of lap N + 1.
		if (summary) messages.push({ type: 'lap', lap: summary });
	}
	const lastSummary = summaries.get(n);
	if (lastSummary) messages.push({ type: 'lap', lap: lastSummary });

	const laps = [...summaries.values()];
	const validTimes = laps.filter(lap => lap.isValid).map(lap => lap.lapTimeMs);
	return {
		messages,
		title: session.title,
		frames,
		laps: laps.length,
		validLaps: validTimes.length,
		bestLapMs: validTimes.length ? Math.min(...validTimes) : null,
		trackLength,
		notes,
	};
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const dtOk = (t: Float64Array, i: number): boolean => t[i] - t[i - 1] > 0;
