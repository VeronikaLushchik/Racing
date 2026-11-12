import {
	TFieldEntry,
	TLapSummary,
	TSessionInfo,
	TSourceKind,
	TTelemetryFrame,
	TWeatherSample,
} from './telemetryTypings';

export interface TSourceOptions {
	/** GT7: PlayStation IP address in the local network. */
	consoleIp?: string;
	/** Replay: file name inside data/sessions (imported files are saved there too). */
	file?: string;
	/** F1: OpenF1 session key. */
	f1SessionKey?: number;
	/** F1: car number of the driver to follow. */
	f1DriverNumber?: number;
	/** Replay / F1: playback speed multiplier (F1 up to ×8, replay up to ×64). */
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
	| { type: 'field'; entries: TFieldEntry[] }
	| { type: 'weather'; weather: TWeatherSample };

export type TClientMessage =
	| { type: 'selectSource'; source: TSourceKind; options?: TSourceOptions }
	| { type: 'stopSource' };

/** What a file import produced; returned by POST /api/imports. */
export interface TImportResult {
	/** Recording name inside data/sessions; start the replay source with it. */
	file: string;
	/** rtlg: session.json + frames.bin from the recorder; relay: a recording of this relay. */
	format: 'rtlg' | 'relay';
	title: string;
	frames: number;
	laps: number;
	validLaps: number;
	bestLapMs: number | null;
	trackLength: number | null;
	/** Message keys of things the import had to guess. */
	notes: TImportNote[];
}

export type TImportNote = 'positionEstimated' | 'trackLengthEstimated' | 'mapMirrored';

export type TImportErrorKey =
	| 'importNoFiles'
	| 'importUnknownFormat'
	| 'importMissingFrames'
	| 'importMissingSession'
	| 'importChannelsMismatch'
	| 'importNoSpeed'
	| 'importEmpty'
	| 'importTooLarge';
