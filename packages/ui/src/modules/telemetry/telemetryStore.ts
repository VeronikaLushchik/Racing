import {
	TFieldEntry,
	TLapSummary,
	TRelayState,
	TServerMessage,
	TSessionInfo,
	TSourceDescriptor,
	TSourceKind,
	TTelemetryFrame,
} from '@racing/shared';

import { computeDelta, LapTrace } from '~@engines/racingMath/deltaModel';

import { LapRecorder } from './lapRecorder';
import { TelemetryRingBuffer } from './ringBuffer';

import { TLapRecord } from './lapTypings';

const BUFFER_SECONDS = 120;
const BUFFER_HZ = 60;
const MAX_LAP_RECORDS = 80;

export type TConnectionState = 'connecting' | 'open' | 'closed';

/** Low-frequency state that React renders. Replaced (never mutated) on change. */
export interface TTelemetryMeta {
	connection: TConnectionState;
	sources: TSourceDescriptor[];
	relayState: TRelayState;
	relaySource: TSourceKind | null;
	relayMessage: string | null;
	session: TSessionInfo | null;
	laps: TLapSummary[];
	/** Laps completed while this page was open, resampled by distance (analysis, strategy). */
	lapRecords: TLapRecord[];
	field: TFieldEntry[];
	bestLapMs: number | null;
}

const initialMeta: TTelemetryMeta = {
	connection: 'connecting',
	sources: [],
	relayState: 'idle',
	relaySource: null,
	relayMessage: null,
	session: null,
	laps: [],
	lapRecords: [],
	field: [],
	bestLapMs: null,
};

type TListener = () => void;

/**
 * Framework-free store for the telemetry stream. High-rate frames go into a ring buffer that
 * charts read on their own timer; React only subscribes to `meta` and to throttled
 * selectors, so 60 Hz data never causes 60 Hz re-renders.
 */
export class TelemetryStore {
	readonly buffer = new TelemetryRingBuffer(BUFFER_SECONDS * BUFFER_HZ);
	latestFrame: TTelemetryFrame | null = null;
	/** Increments on every frame; loops compare it to skip redundant draws. */
	frameVersion = 0;

	private meta: TTelemetryMeta = initialMeta;
	private readonly metaListeners = new Set<TListener>();
	private currentTrace: LapTrace | null = null;
	private previousTrace: LapTrace | null = null;
	private referenceTrace: LapTrace | null = null;
	private readonly lapRecorders = new Map<number, LapRecorder>();

	getMeta = (): TTelemetryMeta => this.meta;

	subscribeMeta = (listener: TListener): (() => void) => {
		this.metaListeners.add(listener);
		return () => this.metaListeners.delete(listener);
	};

	setConnection(connection: TConnectionState): void {
		this.updateMeta({ connection });
	}

	/** Live delta to the best valid lap, seconds. */
	currentDelta(): number | null {
		const frame = this.latestFrame;
		if (!frame) return null;
		return computeDelta(this.referenceTrace, frame.lapDistance, frame.lapTimeMs);
	}

	handleMessage(message: TServerMessage): void {
		switch (message.type) {
			case 'hello':
				this.updateMeta({ sources: message.sources });
				break;
			case 'status':
				this.updateMeta({
					relayState: message.state,
					relaySource: message.source,
					relayMessage: message.message,
				});
				break;
			case 'session':
				this.handleSession(message.session);
				break;
			case 'frame':
				this.handleFrame(message.frame);
				break;
			case 'lap':
				this.handleLap(message.lap);
				break;
			case 'field':
				this.updateMeta({ field: message.entries });
				break;
			default:
				break;
		}
	}

	private handleSession(session: TSessionInfo): void {
		const isNewSession = this.meta.session?.sessionId !== session.sessionId;
		if (isNewSession) {
			this.buffer.clear();
			this.latestFrame = null;
			this.currentTrace = null;
			this.previousTrace = null;
			this.referenceTrace = null;
			this.lapRecorders.clear();
			this.updateMeta({ session, laps: [], lapRecords: [], field: [], bestLapMs: null });
		} else {
			this.updateMeta({ session });
		}
	}

	private handleFrame(frame: TTelemetryFrame): void {
		this.latestFrame = frame;
		this.frameVersion += 1;
		this.buffer.push({
			t: frame.t,
			speed: frame.speed,
			throttle: frame.throttle,
			brake: frame.brake,
			gear: frame.gear,
			rpm: frame.rpm,
			gLat: frame.gLat,
			gLong: frame.gLong,
			lapDistance: frame.lapDistance,
			x: frame.x,
			z: frame.z,
		});
		if (!this.currentTrace || this.currentTrace.lap !== frame.lap) {
			this.previousTrace = this.currentTrace;
			this.currentTrace = new LapTrace(frame.lap);
		}
		this.currentTrace.push(frame.lapDistance, frame.lapTimeMs);

		let recorder = this.lapRecorders.get(frame.lap);
		if (!recorder) {
			recorder = new LapRecorder(frame.lap);
			this.lapRecorders.set(frame.lap, recorder);
			// The lap message for lap N arrives after lap N+1 started; older recorders are stale.
			this.lapRecorders.forEach((_, lap) => {
				if (lap < frame.lap - 1) this.lapRecorders.delete(lap);
			});
		}
		recorder.push(frame);
	}

	private handleLap(lap: TLapSummary): void {
		const laps = [...this.meta.laps.filter(l => l.lap !== lap.lap), lap].sort(
			(a, b) => a.lap - b.lap,
		);
		const isNewBest =
			lap.isValid && (this.meta.bestLapMs === null || lap.lapTimeMs < this.meta.bestLapMs);
		if (isNewBest) {
			const trace = [this.previousTrace, this.currentTrace].find(tr => tr?.lap === lap.lap);
			if (trace && trace.length > 10) this.referenceTrace = trace;
		}
		const record =
			this.lapRecorders.get(lap.lap)?.finish(lap, this.meta.session?.trackLength ?? null) ??
			null;
		this.lapRecorders.delete(lap.lap);
		const lapRecords = record
			? [...this.meta.lapRecords.filter(r => r.lap !== lap.lap), record]
					.sort((a, b) => a.lap - b.lap)
					.slice(-MAX_LAP_RECORDS)
			: this.meta.lapRecords;
		this.updateMeta({
			laps,
			lapRecords,
			bestLapMs: isNewBest ? lap.lapTimeMs : this.meta.bestLapMs,
		});
	}

	private updateMeta(patch: Partial<TTelemetryMeta>): void {
		this.meta = { ...this.meta, ...patch };
		this.metaListeners.forEach(listener => listener());
	}
}
