import zlib from 'zlib';

import { ImportError, TChannel, TChannelTable } from './importTypings';

const GZIP_MAGIC = [0x1f, 0x8b];
const DELIMITERS = [',', ';', '\t'];
/** Rows looked at to find the header (exports often start with a few lines of metadata). */
const HEADER_SEARCH_ROWS = 40;
const MIN_COLUMNS = 3;

/** Units written into a column name: "Speed [km/h]", "speed (km/h)" or "speed_kmh". */
const UNIT_IN_NAME = /^(.*?)\s*[[(]([^\])]*)[\])]\s*$/;

const isNumeric = (cell: string): boolean => cell.trim() !== '' && Number.isFinite(Number(cell));

const unquote = (cell: string): string =>
	cell
		.trim()
		.replace(/^"(.*)"$/, '$1')
		.trim();

const textOf = (data: Buffer): string | null => {
	const isGzip = data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1];
	let buffer = data;
	if (isGzip) {
		try {
			buffer = zlib.gunzipSync(data);
		} catch {
			return null;
		}
	}
	// Binary files are not tables.
	const probe = buffer.subarray(0, 4096);
	if (probe.includes(0)) return null;
	return buffer.toString('utf8').replace(/^﻿/, '');
};

const pickDelimiter = (lines: string[]): string =>
	DELIMITERS.map(delimiter => ({
		delimiter,
		columns: Math.min(...lines.map(line => line.split(delimiter).length)),
	})).sort((a, b) => b.columns - a.columns)[0].delimiter;

/** True when the file looks like a table of samples: a header and numeric rows. */
export const isCsv = (name: string, data: Buffer): boolean => {
	if (/\.(csv|tsv|txt)(\.gz)?$/i.test(name)) return true;
	if (/\.(json|bin|ndjson)(\.gz)?$/i.test(name)) return false;
	const text = textOf(data.subarray(0, 64 * 1024));
	if (!text) return false;
	const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 10);
	if (lines.length < 3) return false;
	const delimiter = pickDelimiter(lines);
	return lines[lines.length - 2].split(delimiter).filter(isNumeric).length >= MIN_COLUMNS;
};

/**
 * Reads a CSV / TSV telemetry log into columns: one sample per row, one channel per column.
 * Works with raw dumps (like a GT7 60 Hz logger: `t_s, lap, x_m, speed_ms, throttle…`) and
 * with exports that have metadata lines on top and a units row under the header (MoTeC,
 * SimHub, Second Monitor…). Units in the header ("Speed [km/h]") are kept for conversion.
 * Text columns are ignored; `track`, `car` and `game` columns or metadata lines are read.
 */
export const readCsv = (name: string, data: Buffer): TChannelTable => {
	const text = textOf(data);
	if (!text) throw new ImportError('importUnknownFormat');
	const lines = text.split(/\r?\n/);
	const probe = lines.filter(line => line.trim()).slice(0, HEADER_SEARCH_ROWS + 5);
	const delimiter = pickDelimiter(probe.slice(-5));
	const split = (line: string): string[] => line.split(delimiter).map(unquote);

	// The header is the last row of mostly text right before the numbers start.
	let headerIndex = -1;
	for (let i = 0; i < Math.min(lines.length - 1, HEADER_SEARCH_ROWS); i += 1) {
		const cells = split(lines[i]);
		const next = split(lines[i + 1] ?? '');
		const afterNext = split(lines[i + 2] ?? '');
		const isHeader =
			cells.length >= MIN_COLUMNS &&
			cells.filter(cell => !isNumeric(cell) && cell).length >= MIN_COLUMNS;
		const numbersFollow =
			next.filter(isNumeric).length >= MIN_COLUMNS ||
			afterNext.filter(isNumeric).length >= MIN_COLUMNS;
		if (isHeader && numbersFollow) {
			headerIndex = i;
			break;
		}
	}
	if (headerIndex < 0) throw new ImportError('importUnknownFormat');

	const meta: Record<string, string> = {};
	lines.slice(0, headerIndex).forEach(line => {
		const [key, value] = split(line).filter(Boolean);
		if (key && value) meta[key.toLowerCase().replace(/[^a-z]/g, '')] = value;
	});

	const header = split(lines[headerIndex]);
	let firstRow = headerIndex + 1;
	let units: string[] = header.map(() => '');
	const unitRow = split(lines[firstRow] ?? '');
	if (unitRow.filter(isNumeric).length < MIN_COLUMNS) {
		units = unitRow;
		firstRow += 1;
	}
	const columns = header.map((raw, i) => {
		const match = UNIT_IN_NAME.exec(raw);
		return {
			name: (match ? match[1] : raw).trim() || `column${i + 1}`,
			unit: (match ? match[2] : (units[i] ?? '')).trim(),
		};
	});

	const rows: string[][] = [];
	for (let i = firstRow; i < lines.length; i += 1) {
		if (!lines[i].trim()) continue;
		const cells = split(lines[i]);
		if (cells.filter(isNumeric).length >= MIN_COLUMNS) rows.push(cells);
	}
	if (rows.length < 2) throw new ImportError('importEmpty');

	const textValue = (keys: string[]): string | null => {
		for (const key of keys) {
			const column = columns.findIndex(c => c.name.toLowerCase() === key);
			if (column >= 0 && rows[0][column] && !isNumeric(rows[0][column])) {
				return rows[0][column];
			}
			if (meta[key]) return meta[key];
		}
		return null;
	};

	const channels: Record<string, TChannel> = {};
	columns.forEach((column, c) => {
		const values = new Float64Array(rows.length);
		let numbers = 0;
		let previous = 0;
		rows.forEach((row, r) => {
			const cell = row[c] ?? '';
			if (isNumeric(cell)) {
				previous = Number(cell);
				numbers += 1;
			}
			// Empty cells (channels logged at a lower rate) hold the last value.
			values[r] = previous;
		});
		if (numbers >= rows.length * 0.5 && !channels[column.name]) {
			channels[column.name] = { values, unit: column.unit };
		}
	});

	const origin =
		textValue(['game', 'sim', 'source']) ?? (/gt7|gran.?turismo/i.test(name) ? 'gt7' : null);
	return {
		origin,
		car: textValue(['car', 'vehicle', 'carmodel']),
		track: textValue(['track', 'venue', 'circuit']),
		startedAt: null,
		trackLength: null,
		count: rows.length,
		channels,
	};
};
