import { TImportErrorKey, TImportNote, TServerMessage } from '@racing/shared';

export interface TChannel {
	values: Float64Array;
	unit: string;
}

/** Samples of a recorded file as columns, before they become telemetry frames. */
export interface TChannelTable {
	/** Game that produced the file, as the recorder names it (ac, acc, gt7…). */
	origin: string | null;
	car: string | null;
	track: string | null;
	/** Epoch ms of the first sample, when known. */
	startedAt: number | null;
	trackLength: number | null;
	count: number;
	channels: Record<string, TChannel>;
}

export interface TImportedSession {
	messages: TServerMessage[];
	title: string;
	frames: number;
	laps: number;
	validLaps: number;
	bestLapMs: number | null;
	trackLength: number | null;
	notes: TImportNote[];
}

/** An import failure the UI can translate by its key. */
export class ImportError extends Error {
	constructor(readonly messageKey: TImportErrorKey) {
		super(messageKey);
	}
}
