import { TFieldEntry, TLapSummary, TTelemetryFrame } from '@racing/shared';

import { TOf1Interval, TOf1Position, TOf1SessionBundle, TOf1Stint } from './openf1Typings';

const G = 9.81;
/** OpenF1 location units are ~1/10 m. */
const LOCATION_SCALE = 0.1;

const toMs = (iso: string): number => Date.parse(iso);

/** Index of the last element with time <= t (or -1). */
const lastAtOrBefore = (times: Float64Array, t: number): number => {
	let lo = 0;
	let hi = times.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= t) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
};

const interpolate = (times: Float64Array, values: Float64Array, t: number): number => {
	const i = lastAtOrBefore(times, t);
	if (i < 0) return values[0] ?? 0;
	if (i >= times.length - 1) return values[times.length - 1];
	const span = times[i + 1] - times[i];
	const k = span > 0 ? (t - times[i]) / span : 0;
	return values[i] + (values[i + 1] - values[i]) * k;
};

const toSeconds = (value: number | string | null): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

interface TLapWindow {
	lap: number;
	startMs: number;
	endMs: number;
	summary: TLapSummary;
}

interface TDriverSeries<T> {
	times: Float64Array;
	rows: T[];
}

const seriesByDriver = <T extends { date: string; driver_number: number }>(
	rows: T[],
): Map<number, TDriverSeries<T>> => {
	const grouped = new Map<number, T[]>();
	for (const row of rows) {
		const list = grouped.get(row.driver_number) ?? [];
		list.push(row);
		grouped.set(row.driver_number, list);
	}
	const result = new Map<number, TDriverSeries<T>>();
	grouped.forEach((list, driver) => {
		list.sort((a, b) => toMs(a.date) - toMs(b.date));
		result.set(driver, { rows: list, times: Float64Array.from(list.map(r => toMs(r.date))) });
	});
	return result;
};

const latest = <T>(series: TDriverSeries<T> | undefined, t: number): T | null => {
	if (!series) return null;
	const i = lastAtOrBefore(series.times, t);
	return i >= 0 ? series.rows[i] : null;
};

/**
 * Turns one driver's historical OpenF1 data into a time-indexed stream of normalized frames.
 * Car data arrives at ~3.7 Hz and location at ~4 Hz, so channels are interpolated; G-forces are
 * derived from speed (longitudinal) and heading change (lateral), because F1 does not publish them.
 */
export class OpenF1Timeline {
	readonly startMs: number;
	readonly endMs: number;
	readonly trackLength: number | null;
	readonly laps: TLapWindow[];

	private readonly carTimes: Float64Array;
	private readonly speed: Float64Array;
	private readonly rpm: Float64Array;
	private readonly throttle: Float64Array;
	private readonly brake: Float64Array;
	private readonly gear: Float64Array;
	private readonly cumulativeDistance: Float64Array;
	private readonly locTimes: Float64Array;
	private readonly locX: Float64Array;
	private readonly locY: Float64Array;
	private readonly intervals: Map<number, TDriverSeries<TOf1Interval>>;
	private readonly positions: Map<number, TDriverSeries<TOf1Position>>;

	constructor(private readonly bundle: TOf1SessionBundle) {
		const car = [...bundle.carData].sort((a, b) => toMs(a.date) - toMs(b.date));
		const loc = [...bundle.location].sort((a, b) => toMs(a.date) - toMs(b.date));
		if (car.length < 2) throw new Error('OpenF1 returned no car data for this driver');

		this.carTimes = Float64Array.from(car.map(r => toMs(r.date)));
		this.speed = Float64Array.from(car.map(r => r.speed));
		this.rpm = Float64Array.from(car.map(r => r.rpm));
		this.throttle = Float64Array.from(
			car.map(r => Math.min(100, Math.max(0, r.throttle)) / 100),
		);
		this.brake = Float64Array.from(car.map(r => (r.brake >= 50 ? 1 : 0)));
		this.gear = Float64Array.from(car.map(r => r.n_gear));
		this.cumulativeDistance = new Float64Array(car.length);
		for (let i = 1; i < car.length; i += 1) {
			const dt = (this.carTimes[i] - this.carTimes[i - 1]) / 1000;
			const v = (this.speed[i] + this.speed[i - 1]) / 2 / 3.6;
			this.cumulativeDistance[i] = this.cumulativeDistance[i - 1] + v * dt;
		}

		this.locTimes = Float64Array.from(loc.map(r => toMs(r.date)));
		this.locX = Float64Array.from(loc.map(r => r.x * LOCATION_SCALE));
		this.locY = Float64Array.from(loc.map(r => r.y * LOCATION_SCALE));

		this.intervals = seriesByDriver(bundle.intervals);
		this.positions = seriesByDriver(bundle.positions);
		this.laps = this.buildLapWindows();

		this.startMs = this.laps[0]?.startMs ?? this.carTimes[0];
		this.endMs = this.carTimes[this.carTimes.length - 1];
		this.trackLength = this.estimateTrackLength();
	}

	frameAt(t: number): TTelemetryFrame {
		const lap = this.lapAt(t);
		const lapStart = lap?.startMs ?? this.startMs;
		const speed = interpolate(this.carTimes, this.speed, t);
		const gearIndex = lastAtOrBefore(this.carTimes, t);

		const vBefore = interpolate(this.carTimes, this.speed, t - 300) / 3.6;
		const vAfter = interpolate(this.carTimes, this.speed, t + 300) / 3.6;
		const gLong = (vAfter - vBefore) / 0.6 / G;

		return {
			t: Math.round(t - this.startMs),
			lap: lap?.lap ?? 0,
			lapTimeMs: Math.round(t - lapStart),
			lapDistance: Math.max(0, this.distanceAt(t) - this.distanceAt(lapStart)),
			speed,
			rpm: Math.round(interpolate(this.carTimes, this.rpm, t)),
			gear: gearIndex >= 0 ? this.gear[gearIndex] : 0,
			throttle: interpolate(this.carTimes, this.throttle, t),
			brake: gearIndex >= 0 ? this.brake[gearIndex] : 0,
			steer: null,
			gLat: this.lateralG(t, speed / 3.6),
			gLong,
			x: interpolate(this.locTimes, this.locX, t),
			z: interpolate(this.locTimes, this.locY, t),
			tyreTemps: null,
			tyreZones: null,
			brakeTemps: null,
			tyreWear: null,
			fuel: null,
			position: latest(this.positions.get(this.bundle.driverNumber), t)?.position ?? null,
		};
	}

	/** Laps that finished in (fromMs, toMs]. */
	lapsFinishedBetween(fromMs: number, toMs: number): TLapSummary[] {
		return this.laps.filter(l => l.endMs > fromMs && l.endMs <= toMs).map(l => l.summary);
	}

	fieldAt(t: number): TFieldEntry[] {
		const playerLap = this.lapAt(t)?.lap ?? 1;
		const entries = this.bundle.drivers.map(driver => {
			const number = driver.driver_number;
			const interval = latest(this.intervals.get(number), t);
			const position = latest(this.positions.get(number), t);
			const stint = this.stintFor(number, playerLap);
			return {
				id: String(number),
				name: driver.name_acronym || driver.full_name,
				position: position?.position ?? 99,
				lap: playerLap,
				gapToLeaderS: toSeconds(interval?.gap_to_leader ?? null),
				intervalS: toSeconds(interval?.interval ?? null),
				compound: stint?.compound ?? null,
				tyreAgeLaps: stint ? playerLap - stint.lap_start + stint.tyre_age_at_start : null,
				isPlayer: number === this.bundle.driverNumber,
			};
		});
		return entries.sort((a, b) => a.position - b.position);
	}

	private lapAt(t: number): TLapWindow | null {
		let found: TLapWindow | null = null;
		for (const lap of this.laps) {
			if (lap.startMs <= t) found = lap;
			else break;
		}
		return found;
	}

	private distanceAt(t: number): number {
		return interpolate(this.carTimes, this.cumulativeDistance, t);
	}

	private headingAt(t: number): number {
		const x1 = interpolate(this.locTimes, this.locX, t - 250);
		const y1 = interpolate(this.locTimes, this.locY, t - 250);
		const x2 = interpolate(this.locTimes, this.locX, t + 250);
		const y2 = interpolate(this.locTimes, this.locY, t + 250);
		return Math.atan2(y2 - y1, x2 - x1);
	}

	private lateralG(t: number, speedMs: number): number {
		if (this.locTimes.length < 2 || speedMs < 5) return 0;
		let dHeading = this.headingAt(t + 250) - this.headingAt(t - 250);
		while (dHeading > Math.PI) dHeading -= 2 * Math.PI;
		while (dHeading < -Math.PI) dHeading += 2 * Math.PI;
		const yawRate = dHeading / 0.5;
		// Counter-clockwise heading change = left turn = negative (left) lateral G.
		const g = (-speedMs * yawRate) / G;
		return Math.max(-6, Math.min(6, g));
	}

	private stintFor(driverNumber: number, lap: number): TOf1Stint | null {
		return (
			this.bundle.stints.find(
				s => s.driver_number === driverNumber && lap >= s.lap_start && lap <= s.lap_end,
			) ?? null
		);
	}

	private buildLapWindows(): TLapWindow[] {
		const pitLaps = new Set(
			this.bundle.pits
				.filter(p => p.driver_number === this.bundle.driverNumber)
				.map(p => p.lap_number),
		);
		const laps = this.bundle.laps
			.filter(l => l.date_start)
			.sort((a, b) => a.lap_number - b.lap_number);

		return laps.map((lap, i) => {
			const startMs = toMs(lap.date_start as string);
			const next = laps[i + 1];
			const endMs = lap.lap_duration
				? startMs + lap.lap_duration * 1000
				: next?.date_start
					? toMs(next.date_start)
					: startMs;
			const sectors = [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3];
			const isPitLap = lap.is_pit_out_lap || pitLaps.has(lap.lap_number);
			return {
				lap: lap.lap_number,
				startMs,
				endMs,
				summary: {
					lap: lap.lap_number,
					lapTimeMs: Math.round((lap.lap_duration ?? (endMs - startMs) / 1000) * 1000),
					sectorsMs: sectors.every(s => typeof s === 'number')
						? sectors.map(s => Math.round((s as number) * 1000))
						: [],
					isValid: lap.lap_duration !== null && !isPitLap && lap.lap_number > 1,
					isPitLap,
					compound:
						this.stintFor(this.bundle.driverNumber, lap.lap_number)?.compound ?? null,
				},
			};
		});
	}

	private estimateTrackLength(): number | null {
		const valid = this.laps.filter(l => l.summary.isValid);
		if (valid.length === 0) return null;
		const fastest = valid.reduce((a, b) => (b.summary.lapTimeMs < a.summary.lapTimeMs ? b : a));
		return Math.round(this.distanceAt(fastest.endMs) - this.distanceAt(fastest.startMs));
	}
}
