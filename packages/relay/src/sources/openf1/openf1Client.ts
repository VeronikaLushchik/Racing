import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { TOf1SessionBundle } from './openf1Typings';

const OPENF1_URL = 'https://api.openf1.org/v1';
const MIN_REQUEST_GAP_MS = 400;
const MAX_RETRIES = 3;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Tiny OpenF1 client: one request at a time (the free tier is rate limited) and every response
 * cached on disk in data/f1/cache, so a race is downloaded once and replays offline afterwards.
 */
export class OpenF1Client {
	private queue: Promise<unknown> = Promise.resolve();
	private lastRequestAt = 0;
	private readonly cacheDir: string;

	constructor(dataDir: string) {
		this.cacheDir = path.join(dataDir, 'f1', 'cache');
		fs.mkdirSync(this.cacheDir, { recursive: true });
	}

	get<T>(endpoint: string, query: Record<string, string | number>): Promise<T[]> {
		const search = new URLSearchParams(
			Object.entries(query).map(([key, value]) => [key, String(value)]),
		).toString();
		const url = `${OPENF1_URL}/${endpoint}?${search}`;
		const run = (): Promise<T[]> => this.fetchCached<T>(url);
		const next = this.queue.then(run, run);
		this.queue = next.catch(() => undefined);
		return next;
	}

	async loadBundle(sessionKey: number, driverNumber: number): Promise<TOf1SessionBundle> {
		const bySession = { session_key: sessionKey };
		const byDriver = { session_key: sessionKey, driver_number: driverNumber };
		const [session] = await this.get<TOf1SessionBundle['session']>('sessions', bySession);
		if (!session) throw new Error(`OpenF1 has no session ${sessionKey}`);

		return {
			session,
			driverNumber,
			drivers: await this.get('drivers', bySession),
			laps: await this.get('laps', byDriver),
			carData: await this.get('car_data', byDriver),
			location: await this.get('location', byDriver),
			stints: await this.get('stints', bySession),
			intervals: await this.get('intervals', bySession),
			positions: await this.get('position', bySession),
			pits: await this.get('pit', bySession),
		};
	}

	private async fetchCached<T>(url: string): Promise<T[]> {
		const file = path.join(
			this.cacheDir,
			`${crypto.createHash('sha1').update(url).digest('hex')}.json`,
		);
		if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];

		for (let attempt = 0; ; attempt += 1) {
			const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
			if (wait > 0) await sleep(wait);
			this.lastRequestAt = Date.now();

			const response = await fetch(url);
			if (response.status === 429 && attempt < MAX_RETRIES) {
				await sleep(2000 * (attempt + 1));
				continue;
			}
			if (!response.ok) throw new Error(`OpenF1 ${response.status} for ${url}`);
			const rows = (await response.json()) as T[];
			fs.writeFileSync(file, JSON.stringify(rows));
			return rows;
		}
	}
}
