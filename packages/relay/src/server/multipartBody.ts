import http from 'http';

import { TUploadedFile } from '../sources/fileImport/fileImport';
import { ImportError } from '../sources/fileImport/importTypings';

/** Recorded sessions are a few MB per hour; this leaves room for long endurance stints. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

export const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_UPLOAD_BYTES) {
				reject(new ImportError('importTooLarge'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});

/** Splits a multipart/form-data body into its file parts. */
export const parseMultipart = (body: Buffer, contentType: string): TUploadedFile[] => {
	const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
	if (!boundary) return [];
	const delimiter = Buffer.from(`--${boundary}`);
	const files: TUploadedFile[] = [];

	let start = body.indexOf(delimiter);
	while (start !== -1) {
		const partStart = start + delimiter.length;
		// "--" right after the delimiter closes the body.
		if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;
		const next = body.indexOf(delimiter, partStart);
		if (next === -1) break;
		const part = body.subarray(partStart + 2, next - 2); // skip CRLF on both sides
		const headerEnd = part.indexOf('\r\n\r\n');
		if (headerEnd !== -1) {
			const headers = part.subarray(0, headerEnd).toString('utf8');
			const name = /filename="([^"]*)"/i.exec(headers)?.[1];
			if (name) files.push({ name, data: part.subarray(headerEnd + 4) });
		}
		start = next;
	}
	return files;
};
