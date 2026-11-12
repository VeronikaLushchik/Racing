import { LAP_CHANNELS, TLapRecord } from './lapTypings';

const DB_NAME = 'racing';
const DB_VERSION = 1;
const LAPS_STORE = 'lap_records';
const SESSIONS_STORE = 'sessions';
/** Sessions kept in the browser; older ones are dropped with their laps. */
const MAX_SESSIONS = 10;

interface TStoredLap {
	sessionId: string;
	lap: number;
	record: TLapRecord;
}

interface TStoredSession {
	sessionId: string;
	updatedAt: number;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});

/**
 * Completed laps saved in IndexedDB, so analysis and strategy survive a page reload. Typed
 * arrays are stored as they are (structured clone), a lap is about 100 KB. Every call fails
 * quietly: without storage (private mode, old browser) the app works as before, just forgetful.
 */
/** Laps saved before a channel was added get it as zeros. */
const withAllChannels = (record: TLapRecord): TLapRecord => {
	const missing = LAP_CHANNELS.filter(channel => !record.channels[channel]);
	if (missing.length === 0) return record;
	const channels = { ...record.channels };
	missing.forEach(channel => {
		channels[channel] = new Float32Array(record.distance.length);
	});
	return { ...record, channels };
};

class LapArchive {
	private database: Promise<IDBDatabase | null> | null = null;

	async load(sessionId: string): Promise<TLapRecord[]> {
		try {
			const db = await this.open();
			if (!db) {
				return [];
			}
			const index = db.transaction(LAPS_STORE).objectStore(LAPS_STORE).index('sessionId');
			const stored = await requestResult<TStoredLap[]>(index.getAll(sessionId));
			return stored.map(item => withAllChannels(item.record)).sort((a, b) => a.lap - b.lap);
		} catch {
			return [];
		}
	}

	async save(sessionId: string, record: TLapRecord): Promise<void> {
		try {
			const db = await this.open();
			if (!db) {
				return;
			}
			const transaction = db.transaction([LAPS_STORE, SESSIONS_STORE], 'readwrite');
			const lap: TStoredLap = { sessionId, lap: record.lap, record };
			const session: TStoredSession = { sessionId, updatedAt: Date.now() };
			transaction.objectStore(LAPS_STORE).put(lap);
			transaction.objectStore(SESSIONS_STORE).put(session);
			await transactionDone(transaction);
			await this.prune(db);
		} catch {
			// Quota or a blocked database: keep the lap in memory only.
		}
	}

	private async prune(db: IDBDatabase): Promise<void> {
		const sessions = await requestResult<TStoredSession[]>(
			db.transaction(SESSIONS_STORE).objectStore(SESSIONS_STORE).getAll(),
		);
		const stale = sessions
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(MAX_SESSIONS)
			.map(session => session.sessionId);
		if (stale.length === 0) {
			return;
		}
		const transaction = db.transaction([LAPS_STORE, SESSIONS_STORE], 'readwrite');
		const laps = transaction.objectStore(LAPS_STORE);
		stale.forEach(sessionId => {
			transaction.objectStore(SESSIONS_STORE).delete(sessionId);
			laps.delete(IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]));
		});
		await transactionDone(transaction);
	}

	private open(): Promise<IDBDatabase | null> {
		this.database ??= new Promise(resolve => {
			if (typeof indexedDB === 'undefined') {
				resolve(null);
				return;
			}
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				const laps = db.createObjectStore(LAPS_STORE, { keyPath: ['sessionId', 'lap'] });
				laps.createIndex('sessionId', 'sessionId');
				db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
			request.onblocked = () => resolve(null);
		});
		return this.database;
	}
}

export const lapArchive = new LapArchive();
