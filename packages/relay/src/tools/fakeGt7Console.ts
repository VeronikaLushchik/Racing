import dgram from 'dgram';

import { GT7_RECEIVE_PORT, GT7_SEND_PORT } from '@racing/shared';

import { TGt7Heartbeat } from '../sources/gt7/gt7Constants';
import { buildGt7Plain, encryptGt7 } from '../sources/gt7/gt7Packet';
import { MockSource } from '../sources/mock/mockSource';

/**
 * Pretends to be a PlayStation running GT7: waits for the relay's heartbeat on UDP 33739 and
 * answers with encrypted packets at 60 Hz, driven by the mock circuit.
 * Lets you develop and demo the GT7 mode without a console: select GT7 with IP 127.0.0.1.
 */
const noop = (): void => undefined;
const mock = new MockSource(
	{ session: noop, frame: noop, lap: noop, field: noop, status: noop },
	{},
);
const socket = dgram.createSocket('udp4');
let target: { address: string; until: number; heartbeat: TGt7Heartbeat } | null = null;
let packetId = 0;
let lastLapMs = -1;
let bestLapMs = -1;
let currentLap = 0;
let lapStartMs = 0;

socket.on('message', (message, rinfo) => {
	const heartbeat = message.toString();
	if (heartbeat === 'A' || heartbeat === 'B') {
		target = { address: rinfo.address, until: Date.now() + 15_000, heartbeat };
	}
});

socket.bind(GT7_SEND_PORT, () => {
	process.stdout.write(`Fake GT7 console listening for heartbeats on UDP ${GT7_SEND_PORT}\n`);
});

setInterval(() => {
	if (!target || Date.now() > target.until) return;
	const frame = mock.step(1 / 60);
	if (frame.lap !== currentLap) {
		if (currentLap > 0) {
			lastLapMs = frame.t - lapStartMs;
			bestLapMs = bestLapMs < 0 ? lastLapMs : Math.min(bestLapMs, lastLapMs);
		}
		currentLap = frame.lap;
		lapStartMs = frame.t;
	}
	const speedMs = frame.speed / 3.6;
	packetId += 1;
	const tyreRadius = 0.33;
	const plain = buildGt7Plain(
		{
			packetId,
			position: [frame.x, 0, frame.z],
			velocity: [0, 0, speedMs],
			angularVelocity: [0, speedMs > 1 ? (frame.gLat * 9.81) / speedMs : 0, 0],
			rpm: frame.rpm,
			fuelLevel: frame.fuel ?? 0,
			fuelCapacity: 100,
			speedMs,
			tyreTemps: frame.tyreTemps ?? [0, 0, 0, 0],
			currentLap,
			totalLaps: 0,
			bestLapMs,
			lastLapMs,
			racePosition: frame.position ?? -1,
			carsInRace: 10,
			gear: frame.gear,
			throttle: frame.throttle,
			brake: frame.brake,
			wheelRps: (frame.wheelSpeeds ?? [0, 0, 0, 0]).map(kmh => kmh / 3.6 / tyreRadius) as [
				number,
				number,
				number,
				number,
			],
			tyreRadius: [tyreRadius, tyreRadius, tyreRadius, tyreRadius],
			suspensionHeight: frame.suspension ?? [0, 0, 0, 0],
			waterTemp: frame.waterTemp ?? 0,
			oilTemp: frame.oilTemp ?? 0,
			wheelRotation: -(frame.steer ?? 0) * (Math.PI / 4),
		},
		target.heartbeat,
	);
	const iv = (Math.random() * 0xffffffff) >>> 0;
	socket.send(encryptGt7(plain, iv, target.heartbeat), GT7_RECEIVE_PORT, target.address);
}, 1000 / 60);
