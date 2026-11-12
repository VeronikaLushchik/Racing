import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import { TServerMessage } from '@racing/shared';

import { buildImportedSession } from './importedSession';
import { TImportResult } from '@racing/shared';

import { ImportError } from './importTypings';
import { isRtlgFrames, isRtlgSession, readRtlg, TRtlgSession } from './rtlgFile';

export interface TUploadedFile {
	name: string;
	data: Buffer;
}

const GZIP_MAGIC = [0x1f, 0x8b];

const slugOf = (value: string): string =>
	value
		.toLowerCase()
		.replace(/\.(ndjson\.gz|ndjson|json|bin|gz)$/, '')
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
 * Turns uploaded files into a relay recording in data/sessions, ready for the replay source.
 * Understands the recorder's session.json + frames.bin pair (Assetto Corsa, GT7…) and the
 * relay's own .ndjson.gz recordings.
 */
export const importFiles = (dataDir: string, files: TUploadedFile[]): TImportResult => {
	if (files.length === 0) throw new ImportError('importNoFiles');
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
		return {
			file,
			format: 'rtlg',
			title: imported.title,
			frames: imported.frames,
			laps: imported.laps,
			validLaps: imported.validLaps,
			bestLapMs: imported.bestLapMs,
			trackLength: imported.trackLength,
			notes: imported.notes,
		};
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
		};
	}

	throw new ImportError('importUnknownFormat');
};
