import { TClientMessage, TServerMessage } from '@racing/shared';

import { TelemetryStore } from 'src/modules/telemetry/telemetryStore';

const MAX_BACKOFF_MS = 5000;

/** Keeps a WebSocket to the relay open (with backoff) and feeds every message into the store. */
export class TelemetrySocket {
	private socket: WebSocket | null = null;
	private retryMs = 500;
	private retryTimer: number | null = null;
	private isClosed = false;

	constructor(
		private readonly url: string,
		private readonly store: TelemetryStore,
	) {}

	connect(): void {
		this.isClosed = false;
		if (this.retryTimer) window.clearTimeout(this.retryTimer);
		this.socket?.close();
		this.store.setConnection('connecting');
		const socket = new WebSocket(this.url);
		this.socket = socket;
		// Only the current socket may touch the store: a socket closed by an earlier close() can
		// still report after connect() opened the next one (React mounts effects twice in
		// development), and two live sockets would feed every frame twice.
		const isCurrent = () => this.socket === socket;
		socket.onopen = () => {
			if (!isCurrent()) return;
			this.retryMs = 500;
			this.store.setConnection('open');
		};
		socket.onmessage = event => {
			if (!isCurrent()) return;
			try {
				this.store.handleMessage(JSON.parse(event.data as string) as TServerMessage);
			} catch {
				// Ignore malformed messages.
			}
		};
		socket.onclose = () => {
			if (!isCurrent()) return;
			this.store.setConnection('closed');
			if (this.isClosed) return;
			this.retryTimer = window.setTimeout(() => this.connect(), this.retryMs);
			this.retryMs = Math.min(MAX_BACKOFF_MS, this.retryMs * 2);
		};
	}

	send(message: TClientMessage): void {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
	}

	close(): void {
		this.isClosed = true;
		if (this.retryTimer) window.clearTimeout(this.retryTimer);
		this.socket?.close();
	}
}
