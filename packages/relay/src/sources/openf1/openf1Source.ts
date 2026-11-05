import { TSourceOptions } from '@racing/shared';

import { TSourceSink, TTelemetrySource } from '../sourceTypings';
import { OpenF1Client } from './openf1Client';
import { OpenF1Timeline } from './openf1Timeline';

const TICK_MS = 50;
const FIELD_EVERY_TICKS = 10;

/** Replays a real Formula 1 race from OpenF1 historical data as if it were live. */
export class OpenF1Source implements TTelemetrySource {
	private timer: NodeJS.Timeout | null = null;
	private isStopped = false;

	constructor(
		private readonly sink: TSourceSink,
		private readonly options: TSourceOptions,
		private readonly client: OpenF1Client,
	) {}

	async start(): Promise<void> {
		const { f1SessionKey, f1DriverNumber } = this.options;
		if (!f1SessionKey || !f1DriverNumber) {
			this.sink.status('error', 'Pick a race and a driver.');
			return;
		}

		this.sink.status(
			'connecting',
			'Downloading race data from OpenF1 (cached after the first time)…',
		);
		let timeline: OpenF1Timeline;
		let title: string;
		let driverName: string | null;
		try {
			const bundle = await this.client.loadBundle(f1SessionKey, f1DriverNumber);
			timeline = new OpenF1Timeline(bundle);
			const { session } = bundle;
			title = `${session.year} ${session.country_name} — ${session.session_name}`;
			driverName =
				bundle.drivers.find(d => d.driver_number === f1DriverNumber)?.full_name ?? null;
			if (this.isStopped) return;
			this.sink.session({
				sessionId: `f1-${f1SessionKey}-${f1DriverNumber}`,
				source: 'f1',
				title,
				track: session.circuit_short_name,
				driver: driverName,
				trackLength: timeline.trackLength,
				capabilities: {
					isLive: false,
					hasSteering: false,
					hasTyreTemps: false,
					hasTyreZones: false,
					hasBrakeTemps: false,
					hasTyreWear: false,
					hasFuel: false,
					hasSectors: true,
					hasOpponents: true,
					hasMeasuredG: false,
					hasWeather: timeline.hasWeather,
				},
			});
		} catch (error) {
			this.sink.status('error', error instanceof Error ? error.message : String(error));
			return;
		}

		this.sink.status('streaming', null);
		const rate = Math.min(16, Math.max(0.25, this.options.rate ?? 1));
		let t = timeline.startMs;
		let ticks = 0;
		let weatherIndex = -1;
		this.timer = setInterval(() => {
			const next = t + TICK_MS * rate;
			if (next > timeline.endMs) {
				this.stop();
				this.sink.status('idle', 'Race replay finished.');
				return;
			}
			timeline.lapsFinishedBetween(t, next).forEach(lap => this.sink.lap(lap));
			t = next;
			this.sink.frame(timeline.frameAt(t));
			ticks += 1;
			if (ticks % FIELD_EVERY_TICKS === 0) this.sink.field(timeline.fieldAt(t));
			const nextWeatherIndex = timeline.weatherIndexAt(t);
			if (nextWeatherIndex !== weatherIndex) {
				weatherIndex = nextWeatherIndex;
				const weather = timeline.weatherAt(t);
				if (weather) this.sink.weather(weather);
			}
		}, TICK_MS);
	}

	stop(): void {
		this.isStopped = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}
