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
	/** Replay / F1 / demo: playback speed multiplier (F1 up to ×16, replay and demo up to ×64). */
	rate?: number;
	/** Demo: race length in laps; the demo race ends with the chequered flag after it. */
	raceLaps?: number;
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
	| { type: 'weather'; weather: TWeatherSample }
	/** Playback speed of a replayed source; null for live sources, which cannot change it. */
	| { type: 'playback'; rate: number | null };

export type TClientMessage =
	| { type: 'selectSource'; source: TSourceKind; options?: TSourceOptions }
	| { type: 'stopSource' }
	| { type: 'setRate'; rate: number };

/** What a file import produced; returned by POST /api/imports. */
export interface TImportResult {
	/** Recording name inside data/sessions; start the replay source with it. */
	file: string;
	/**
	 * rtlg: session.json + frames.bin from the recorder; csv: a raw CSV / TSV log; relay: a
	 * recording of this relay.
	 */
	format: 'rtlg' | 'csv' | 'relay';
	title: string;
	frames: number;
	laps: number;
	validLaps: number;
	bestLapMs: number | null;
	trackLength: number | null;
	/** Message keys of things the import had to guess. */
	notes: TImportNote[];
	/** What the file had, so the upload page can say which dashboards it fills. */
	channels: TImportChannel[];
	/** Laps with a pit stop (refuelling, standing in the box, or a pit lane flag). */
	pitLaps: number;
	/** Size of the uploaded files, bytes. */
	bytes: number;
}

export type TImportChannel =
	| 'speed'
	| 'rpm'
	| 'gear'
	| 'throttle'
	| 'brake'
	| 'steer'
	| 'gForce'
	| 'yawRate'
	| 'trackPosition'
	| 'lapTimer'
	| 'fuel'
	| 'tyreTemps'
	| 'tyreZones'
	| 'tyreWear'
	| 'brakeTemps'
	| 'wheelSpeeds'
	| 'suspension'
	| 'engineTemps'
	| 'racePosition';

/** A recording made from an uploaded file; listed by GET /api/imports. */
export interface TImportedRecording {
	file: string;
	title: string;
	format: TImportResult['format'];
	createdAt: number;
	laps: number;
	validLaps: number;
	bestLapMs: number | null;
	bytes: number;
	channels: TImportChannel[];
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
