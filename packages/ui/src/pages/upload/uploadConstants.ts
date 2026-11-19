import { TImportChannel, TImportErrorKey, TImportNote } from '@racing/shared';

/** Files the upload page takes: recorder sessions, raw CSV / TSV logs and relay recordings. */
export const UPLOAD_ACCEPT = '.json,.bin,.csv,.tsv,.txt,.gz,.ndjson';

/** Channels in the order the page lists them, each with what it fills on the dashboards. */
export const CHANNEL_ORDER: TImportChannel[] = [
	'speed',
	'throttle',
	'brake',
	'gear',
	'rpm',
	'steer',
	'gForce',
	'yawRate',
	'trackPosition',
	'lapTimer',
	'fuel',
	'tyreTemps',
	'tyreZones',
	'tyreWear',
	'brakeTemps',
	'wheelSpeeds',
	'suspension',
	'engineTemps',
	'racePosition',
];

/** Channels that are only a fallback for another one: not shown as missing. */
export const FALLBACK_CHANNELS: Partial<Record<TImportChannel, TImportChannel>> = {
	yawRate: 'gForce',
};

export const ERROR_KEYS: Record<TImportErrorKey, TTranslationKey> = {
	importNoFiles: 'source.importError.noFiles',
	importUnknownFormat: 'source.importError.unknownFormat',
	importMissingFrames: 'source.importError.missingFrames',
	importMissingSession: 'source.importError.missingSession',
	importChannelsMismatch: 'source.importError.channelsMismatch',
	importNoSpeed: 'source.importError.noSpeed',
	importEmpty: 'source.importError.empty',
	importTooLarge: 'source.importError.tooLarge',
};

export const NOTE_KEYS: Record<TImportNote, TTranslationKey> = {
	positionEstimated: 'source.importNote.positionEstimated',
	trackLengthEstimated: 'source.importNote.trackLengthEstimated',
	mapMirrored: 'source.importNote.mapMirrored',
};

/** Replay speed the "Open analysis" button uses: the whole file in seconds. */
export const ANALYSIS_RATE = 64;
