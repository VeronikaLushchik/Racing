import dgram from 'dgram';

import { GT7_RECEIVE_PORT, GT7_SEND_PORT, TSourceOptions } from '@racing/shared';

import { LapTracker } from '../../pipeline/lapTracker';
import { TSourceSink, TTelemetrySource } from '../sourceTypings';
import { GT7_HEARTBEAT_INTERVAL_MS, GT7_HEARTBEATS, GT7_SILENCE_TIMEOUT_MS } from './gt7Constants';
import { Gt7Normalizer } from './gt7Normalizer';
import { decryptGt7, parseGt7 } from './gt7Packet';

const HEARTBEAT = 'A' as const;

/** Live Gran Turismo 7 telemetry from a PlayStation in the same local network. */
export class Gt7Source implements TTelemetrySource {
	private socket: dgram.Socket | null = null;
	private heartbeatTimer: NodeJS.Timeout | null = null;
	private watchdogTimer: NodeJS.Timeout | null = null;
	private readonly normalizer = new Gt7Normalizer();
	private lapTracker = new LapTracker(null);
	private lastPacketAt = 0;
	private lastPacketId = -1;
	private isStreaming = false;
	private trackLength: number | null = null;
	private readonly sessionId = `gt7-${Date.now()}`;

	constructor(
		private readonly sink: TSourceSink,
		private readonly options: TSourceOptions,
	) {}

	async start(): Promise<void> {
		const consoleIp = this.options.consoleIp?.trim();
		if (!consoleIp) {
			this.sink.status(
				'error',
				'Enter the PlayStation IP address (Settings → Network on the PS5).',
			);
			return;
		}

		this.emitSession();
		this.sink.status('connecting', `Waiting for packets from ${consoleIp}…`);

		const socket = dgram.createSocket('udp4');
		this.socket = socket;
		socket.on('message', message => this.handleMessage(message));
		socket.on('error', error => this.sink.status('error', `UDP error: ${error.message}`));
		await new Promise<void>((resolve, reject) => {
			socket.once('error', reject);
			socket.bind(GT7_RECEIVE_PORT, () => {
				socket.off('error', reject);
				resolve();
			});
		});

		const sendHeartbeat = (): void => {
			socket.send(GT7_HEARTBEATS[HEARTBEAT].byte, GT7_SEND_PORT, consoleIp);
		};
		sendHeartbeat();
		this.heartbeatTimer = setInterval(sendHeartbeat, GT7_HEARTBEAT_INTERVAL_MS);
		this.watchdogTimer = setInterval(() => this.checkSilence(consoleIp), 500);
	}

	stop(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		if (this.watchdogTimer) clearInterval(this.watchdogTimer);
		this.socket?.close();
		this.socket = null;
	}

	private emitSession(): void {
		this.sink.session({
			sessionId: this.sessionId,
			source: 'gt7',
			title: 'Gran Turismo 7 (live)',
			track: null,
			driver: 'You',
			trackLength: this.trackLength,
			capabilities: {
				isLive: true,
				hasSteering: false,
				hasTyreTemps: true,
				hasTyreZones: false,
				hasBrakeTemps: false,
				hasTyreWear: false,
				hasFuel: true,
				hasSectors: this.trackLength !== null,
				hasOpponents: false,
				hasMeasuredG: false,
			},
		});
	}

	private handleMessage(message: Buffer): void {
		const plain = decryptGt7(new Uint8Array(message), HEARTBEAT);
		if (!plain) return;
		const packet = parseGt7(plain);
		if (packet.packetId === this.lastPacketId) return;
		this.lastPacketId = packet.packetId;
		this.lastPacketAt = Date.now();

		if (!this.isStreaming) {
			this.isStreaming = true;
			this.sink.status('streaming', null);
		}

		const frame = this.normalizer.push(packet, this.lastPacketAt);
		if (!frame) return;
		this.sink.frame(frame);

		const lap = this.lapTracker.push(frame, packet.lastLapMs);
		if (lap) {
			this.sink.lap(lap);
			if (this.trackLength === null && lap.lapTimeMs > 0) {
				// First full lap tells us the track length; from now on sectors can be split.
				this.trackLength = Math.round(this.lastLapDistance ?? 0) || null;
				if (this.trackLength) {
					this.lapTracker = new LapTracker(this.trackLength);
					this.lapTracker.push(frame);
					this.emitSession();
				}
			}
		}
		this.lastLapDistance = frame.lapDistance;
	}

	private lastLapDistance: number | null = null;

	private checkSilence(consoleIp: string): void {
		if (this.isStreaming && Date.now() - this.lastPacketAt > GT7_SILENCE_TIMEOUT_MS) {
			this.isStreaming = false;
			this.sink.status(
				'connecting',
				`No packets from ${consoleIp}. Is GT7 running and on track?`,
			);
		}
	}
}
