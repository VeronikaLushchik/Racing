import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import { TServerMessage } from '@racing/shared';

import { TImportedRecording, TImportResult } from '@racing/shared';

import { isCsv, readCsv } from './csvFile';
import { buildImportedSession } from './importedSession';
import { ImportError, TImportedSession } from './importTypings';
import { isRtlgFrames, isRtlgSession, readRtlg, TRtlgSession } from './rtlgFile';

export interface TUploadedFile {
	name: string;
	data: Buffer;
}

const GZIP_MAGIC = [0x1f, 0x8b];

const slugOf = (value: string): string =>
	value
		.toLowerCase()
		.replace(/\.(ndjson\.gz|csv\.gz|tsv\.gz|ndjson|json|bin|csv|tsv|txt|gz)$/, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60) || 'session';

const parseJson = (file: TUploadedFile): unknown => {
	try {
		return JSON.parse(file.data.toString('utf8'));
	} catch {
		return null;
	}
};

const writeRecording = (dataDir: string, name: string, messages: TServerMessage[]): void => {
	const dir = path.join(dataDir, 'sessions');
	fs.mkdirSync(dir, { recursive: true });
	const body = messages.map(message => JSON.stringify(message)).join('\n');
	fs.writeFileSync(path.join(dir, name), zlib.gzipSync(`${body}\n`));
};

const importsDir = (dataDir: string): string => path.join(dataDir, 'imports');

/** Keeps what an import produced next to the recording, for the list of past uploads. */
const writeSummary = (dataDir: string, result: TImportResult): void => {
	const dir = importsDir(dataDir);
	fs.mkdirSync(dir, { recursive: true });
	const summary: TImportedRecording = {
		file: result.file,
		title: result.title,
		format: result.format,
		createdAt: Date.now(),
		laps: result.laps,
		validLaps: result.validLaps,
		bestLapMs: result.bestLapMs,
		bytes: result.bytes,
		channels: result.channels,
	};
	fs.writeFileSync(path.join(dir, `${result.file}.json`), JSON.stringify(summary));
};

/** Files uploaded before, newest first; only those whose recording still exists. */
export const listImports = (dataDir: string): TImportedRecording[] => {
	const dir = importsDir(dataDir);
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter(name => name.endsWith('.json'))
		.flatMap(name => {
			try {
				const summary = JSON.parse(
					fs.readFileSync(path.join(dir, name), 'utf8'),
				) as TImportedRecording;
				const recording = path.join(dataDir, 'sessions', summary.file);
				return fs.existsSync(recording) ? [summary] : [];
			} catch {
				return [];
			}
		})
		.sort((a, b) => b.createdAt - a.createdAt);
};

const fromImported = (
	imported: TImportedSession,
	file: string,
	format: TImportResult['format'],
	bytes: number,
): TImportResult => ({
	file,
	format,
	title: imported.title,
	frames: imported.frames,
	laps: imported.laps,
	validLaps: imported.validLaps,
	bestLapMs: imported.bestLapMs,
	trackLength: imported.trackLength,
	notes: imported.notes,
	channels: imported.channels,
	pitLaps: imported.pitLaps,
	bytes,
});

/** A session the relay itself recorded (data/sessions/*.ndjson.gz), e.g. from another computer. */
const readRelayRecording = (file: TUploadedFile): TServerMessage[] | null => {
	const isGzip = file.data[0] === GZIP_MAGIC[0] && file.data[1] === GZIP_MAGIC[1];
	let text: string;
	try {
		text = (isGzip ? zlib.gunzipSync(file.data) : file.data).toString('utf8');
	} catch {
		return null;
	}
	const messages: TServerMessage[] = [];
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		try {
			const message = JSON.parse(line) as TServerMessage;
			if (typeof message?.type !== 'string') return null;
			messages.push(message);
		} catch {
			return null;
		}
	}
	return messages.some(message => message.type === 'session') ? messages : null;
};

/**
 * Turns uploaded files into a relay recording in data/sessions, ready for the replay source,
 * and remembers it in the list of uploads.
 */
export const importFiles = (dataDir: string, files: TUploadedFile[]): TImportResult => {
	const result = convertFiles(dataDir, files);
	writeSummary(dataDir, result);
	return result;
};

/**
 * Understands the recorder's session.json + frames.bin pair (Assetto Corsa, GT7…), raw CSV /
 * TSV logs (one row per sample) and the relay's own .ndjson.gz recordings.
 */
const convertFiles = (dataDir: string, files: TUploadedFile[]): TImportResult => {
	if (files.length === 0) throw new ImportError('importNoFiles');
	const bytes = files.reduce((sum, file) => sum + file.data.length, 0);
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

	const frames = files.find(file => isRtlgFrames(file.data));
	const sessionFile = files
		.map(file => ({ file, json: parseJson(file) }))
		.find(({ json }) => isRtlgSession(json));

	if (frames || sessionFile) {
		if (!frames) throw new ImportError('importMissingFrames');
		if (!sessionFile) throw new ImportError('importMissingSession');
		const session = sessionFile.json as TRtlgSession;
		const sessionId = `import-${slugOf(session.id ?? sessionFile.file.name)}-${stamp}`;
		const imported = buildImportedSession(readRtlg(session, frames.data), sessionId);
		const file = `${sessionId}.ndjson.gz`;
		writeRecording(dataDir, file, imported.messages);
		return fromImported(imported, file, 'rtlg', bytes);
	}

	const csv = files.find(file => isCsv(file.name, file.data));
	if (csv) {
		const sessionId = `import-${slugOf(csv.name)}-${stamp}`;
		const imported = buildImportedSession(readCsv(csv.name, csv.data), sessionId);
		// A raw log rarely names its track or car: the file name tells the sessions apart.
		if (!imported.title.includes(' · ')) {
			imported.title = `${imported.title} · ${csv.name.replace(/\.(csv|tsv|txt)(\.gz)?$/i, '')}`;
			const first = imported.messages[0];
			if (first?.type === 'session') first.session.title = imported.title;
		}
		const file = `${sessionId}.ndjson.gz`;
		writeRecording(dataDir, file, imported.messages);
		return fromImported(imported, file, 'csv', bytes);
	}

	for (const upload of files) {
		const messages = readRelayRecording(upload);
		if (!messages) continue;
		const file = `import-${slugOf(upload.name)}-${stamp}.ndjson.gz`;
		writeRecording(dataDir, file, messages);
		const session = messages.find(message => message.type === 'session');
		const laps = messages.flatMap(message => (message.type === 'lap' ? [message.lap] : []));
		const validTimes = laps.filter(lap => lap.isValid).map(lap => lap.lapTimeMs);
		return {
			file,
			format: 'relay',
			title: session?.type === 'session' ? session.session.title : upload.name,
			frames: messages.filter(message => message.type === 'frame').length,
			laps: laps.length,
			validLaps: validTimes.length,
			bestLapMs: validTimes.length ? Math.min(...validTimes) : null,
			trackLength: session?.type === 'session' ? session.session.trackLength : null,
			notes: [],
			channels: [],
			pitLaps: laps.filter(lap => lap.isPitLap).length,
			bytes,
		};
	}

	throw new ImportError('importUnknownFormat');
};
