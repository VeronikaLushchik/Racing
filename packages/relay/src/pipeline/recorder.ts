import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import { TServerMessage } from '@racing/shared';

/** Writes every relayed message to data/sessions/<id>.ndjson.gz for later replay. */
export class Recorder {
	private readonly gzip: zlib.Gzip;
	readonly filePath: string;

	constructor(dataDir: string, sessionId: string) {
		const dir = path.join(dataDir, 'sessions');
		fs.mkdirSync(dir, { recursive: true });
		this.filePath = path.join(dir, `${sessionId}.ndjson.gz`);
		this.gzip = zlib.createGzip();
		this.gzip.pipe(fs.createWriteStream(this.filePath));
	}

	write(message: TServerMessage): void {
		this.gzip.write(`${JSON.stringify(message)}\n`);
	}

	close(): void {
		this.gzip.end();
	}
}

export const listRecordings = (dataDir: string): string[] => {
	const dir = path.join(dataDir, 'sessions');
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter(name => name.endsWith('.ndjson.gz'))
		.sort()
		.reverse();
};
