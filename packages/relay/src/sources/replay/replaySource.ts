import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';

import { TServerMessage, TSourceOptions } from '@racing/shared';

import { TSourceSink, TTelemetrySource } from '../sourceTypings';

const TICK_MS = 16;
/** Fast enough to skim an hour-long session in about a minute. */
export const REPLAY_MAX_RATE = 64;

/** Plays back a session recorded by the relay (data/sessions/*.ndjson.gz). */
export class ReplaySource implements TTelemetrySource {
	private timer: NodeJS.Timeout | null = null;
	private rate = Math.min(REPLAY_MAX_RATE, Math.max(0.25, this.options.rate ?? 1));

	constructor(
		private readonly sink: TSourceSink,
		private readonly options: TSourceOptions,
		private readonly dataDir: string,
	) {}

	async start(): Promise<void> {
		const name = path.basename(this.options.file ?? '');
		const file = path.join(this.dataDir, 'sessions', name);
		if (!name || !fs.existsSync(file)) {
			this.sink.status('error', `Recording not found: ${name || '(none selected)'}`);
			return;
		}

		const messages = await readMessages(file);
		let index = 0;
		let clock = 0;

		this.sink.status('streaming', null);
		this.timer = setInterval(() => {
			clock += TICK_MS * this.rate;
			while (index < messages.length) {
				const message = messages[index];
				if (message.type === 'frame' && message.frame.t > clock) break;
				this.emit(message, name);
				index += 1;
			}
			if (index >= messages.length) {
				this.stop();
				this.sink.status('idle', 'Replay finished.');
			}
		}, TICK_MS);
	}

	/** Changes the playback speed of a running replay; returns the speed applied. */
	setRate(rate: number): number {
		this.rate = Math.min(REPLAY_MAX_RATE, Math.max(0.25, rate));
		return this.rate;
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private emit(message: TServerMessage, name: string): void {
		switch (message.type) {
			case 'session':
				this.sink.session({
					...message.session,
					title: `Replay: ${message.session.title}`,
					capabilities: { ...message.session.capabilities, isLive: false },
					sessionId: `replay-${name}`,
				});
				break;
			case 'frame':
				this.sink.frame(message.frame);
				break;
			case 'lap':
				this.sink.lap(message.lap);
				break;
			case 'field':
				this.sink.field(message.entries);
				break;
			case 'weather':
				this.sink.weather(message.weather);
				break;
			default:
				break;
		}
	}
}

const readMessages = async (file: string): Promise<TServerMessage[]> => {
	const lines = readline.createInterface({
		input: fs.createReadStream(file).pipe(zlib.createGunzip()),
		crlfDelay: Infinity,
	});
	const messages: TServerMessage[] = [];
	for await (const line of lines) {
		if (line.trim()) messages.push(JSON.parse(line) as TServerMessage);
	}
	return messages;
};
