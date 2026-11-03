import {
	TFieldEntry,
	TLapSummary,
	TSessionInfo,
	TSourceKind,
	TTelemetryFrame,
} from './telemetryTypings';

export interface TSourceOptions {
	/** GT7: PlayStation IP address in the local network. */
	consoleIp?: string;
	/** Replay: file name inside data/sessions. */
	file?: string;
	/** F1: OpenF1 session key. */
	f1SessionKey?: number;
	/** F1: car number of the driver to follow. */
	f1DriverNumber?: number;
	/** Replay / F1: playback speed multiplier. */
	rate?: number;
}

export interface TSourceDescriptor {
	kind: TSourceKind;
	isAvailable: boolean;
	note: string | null;
}

export type TRelayState = 'idle' | 'connecting' | 'streaming' | 'error';

export type TServerMessage =
	| { type: 'hello'; protocolVersion: number; sources: TSourceDescriptor[] }
	| { type: 'status'; state: TRelayState; source: TSourceKind | null; message: string | null }
	| { type: 'session'; session: TSessionInfo }
	| { type: 'frame'; frame: TTelemetryFrame }
	| { type: 'lap'; lap: TLapSummary }
	| { type: 'field'; entries: TFieldEntry[] };

export type TClientMessage =
	| { type: 'selectSource'; source: TSourceKind; options?: TSourceOptions }
	| { type: 'stopSource' };
