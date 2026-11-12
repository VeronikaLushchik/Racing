import {
	RELAY_FRAME_HZ,
	TClientMessage,
	TFieldEntry,
	TLapSummary,
	TServerMessage,
	TSessionInfo,
	TSourceDescriptor,
	TSourceKind,
	TSourceOptions,
	TWeatherSample,
} from '@racing/shared';

import { Recorder } from '../pipeline/recorder';
import { Gt7Source } from '../sources/gt7/gt7Source';
import { MockSource } from '../sources/mock/mockSource';
import { OpenF1Client } from '../sources/openf1/openf1Client';
import { OpenF1Source } from '../sources/openf1/openf1Source';
import { ReplaySource } from '../sources/replay/replaySource';
import { TSourceSink, TTelemetrySource } from '../sources/sourceTypings';

type TBroadcast = (message: TServerMessage) => void;

const MIN_FRAME_GAP_MS = 1000 / RELAY_FRAME_HZ - 2;

export const SOURCE_DESCRIPTORS: TSourceDescriptor[] = [
	{ kind: 'gt7', isAvailable: true, note: 'PS5/PS4 in the same network' },
	{ kind: 'f1', isAvailable: true, note: 'Real races from OpenF1 historical data' },
	{ kind: 'mock', isAvailable: true, note: 'Synthetic circuit, no game needed' },
	{ kind: 'replay', isAvailable: true, note: 'Sessions recorded by this relay' },
];

/**
 * Owns the single active source and fans its output out to every browser.
 * Live sessions (GT7, mock) are recorded so they can be replayed later.
 */
export class RelayHub {
	private source: TTelemetrySource | null = null;
	private recorder: Recorder | null = null;
	private lastSession: TSessionInfo | null = null;
	private sessionLaps: TLapSummary[] = [];
	private lastField: TFieldEntry[] = [];
	private lastWeather: TWeatherSample | null = null;
	private lastStatus: TServerMessage = {
		type: 'status',
		state: 'idle',
		source: null,
		message: null,
	};
	private lastFrameSentAt = 0;
	private activeKind: TSourceKind | null = null;
	private playbackRate: number | null = null;

	constructor(
		private readonly broadcast: TBroadcast,
		private readonly dataDir: string,
		private readonly f1Client: OpenF1Client,
	) {}

	/** Messages a newly connected browser needs to catch up. */
	welcome(): TServerMessage[] {
		const messages: TServerMessage[] = [
			{ type: 'hello', protocolVersion: 1, sources: SOURCE_DESCRIPTORS },
			this.lastStatus,
		];
		if (this.lastSession) messages.push({ type: 'session', session: this.lastSession });
		this.sessionLaps.forEach(lap => messages.push({ type: 'lap', lap }));
		if (this.lastField.length) messages.push({ type: 'field', entries: this.lastField });
		if (this.lastWeather) messages.push({ type: 'weather', weather: this.lastWeather });
		messages.push({ type: 'playback', rate: this.playbackRate });
		return messages;
	}

	async handleClientMessage(message: TClientMessage): Promise<void> {
		if (message.type === 'selectSource') {
			await this.select(message.source, message.options ?? {});
		} else if (message.type === 'setRate') {
			if (this.source?.setRate && Number.isFinite(message.rate)) {
				this.setPlayback(this.source.setRate(message.rate));
			}
		} else if (message.type === 'stopSource') {
			this.stopCurrent();
			this.emit({ type: 'status', state: 'idle', source: null, message: null });
		}
	}

	async select(kind: TSourceKind, options: TSourceOptions): Promise<void> {
		this.stopCurrent();
		this.activeKind = kind;
		this.lastSession = null;
		this.sessionLaps = [];
		this.lastField = [];
		this.lastWeather = null;
		const sink = this.createSink(kind);
		this.source = this.createSource(kind, sink, options);
		this.setPlayback(this.source.setRate ? this.source.setRate(options.rate ?? 1) : null);
		sink.status('connecting', null);
		await this.source.start();
	}

	stopCurrent(): void {
		this.source?.stop();
		this.source = null;
		this.recorder?.close();
		this.recorder = null;
		this.activeKind = null;
		this.setPlayback(null);
	}

	private setPlayback(rate: number | null): void {
		if (rate === this.playbackRate) return;
		this.playbackRate = rate;
		this.broadcast({ type: 'playback', rate });
	}

	private createSource(
		kind: TSourceKind,
		sink: TSourceSink,
		options: TSourceOptions,
	): TTelemetrySource {
		switch (kind) {
			case 'gt7':
				return new Gt7Source(sink, options);
			case 'f1':
				return new OpenF1Source(sink, options, this.f1Client);
			case 'replay':
				return new ReplaySource(sink, options, this.dataDir);
			case 'mock':
			default:
				return new MockSource(sink, options);
		}
	}

	private createSink(kind: TSourceKind): TSourceSink {
		const isCurrent = (): boolean => this.activeKind === kind;
		const shouldRecord = kind === 'gt7' || kind === 'mock';
		// A replay already paces its frames; at high speed every one is needed for lap analysis.
		const shouldThrottle = kind !== 'replay';

		return {
			session: session => {
				if (!isCurrent()) return;
				if (this.lastSession?.sessionId !== session.sessionId) {
					this.sessionLaps = [];
					this.lastField = [];
					this.lastWeather = null;
				}
				this.lastSession = session;
				if (shouldRecord && !this.recorder) {
					this.recorder = new Recorder(this.dataDir, session.sessionId);
				}
				this.emit({ type: 'session', session });
			},
			frame: frame => {
				if (!isCurrent()) return;
				this.recorder?.write({ type: 'frame', frame });
				const now = Date.now();
				if (shouldThrottle && now - this.lastFrameSentAt < MIN_FRAME_GAP_MS) return;
				this.lastFrameSentAt = now;
				this.broadcast({ type: 'frame', frame });
			},
			lap: lap => {
				if (!isCurrent()) return;
				this.sessionLaps = [...this.sessionLaps.filter(l => l.lap !== lap.lap), lap];
				this.emit({ type: 'lap', lap });
			},
			field: entries => {
				if (!isCurrent()) return;
				this.lastField = entries;
				this.emit({ type: 'field', entries });
			},
			weather: weather => {
				if (!isCurrent()) return;
				this.lastWeather = weather;
				this.emit({ type: 'weather', weather });
			},
			status: (state, message) =>
				isCurrent() && this.emit({ type: 'status', state, source: kind, message }),
		};
	}

	private emit(message: TServerMessage): void {
		if (message.type === 'status') this.lastStatus = message;
		this.recorder?.write(message);
		this.broadcast(message);
	}
}
