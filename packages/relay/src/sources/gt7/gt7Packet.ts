/** @format */

import { salsa20Xor } from './salsa20';
import {
	GT7_FLAGS,
	GT7_HEARTBEATS,
	GT7_IV_OFFSET,
	GT7_KEY,
	GT7_MAGIC,
	GT7_OFFSETS as O,
	TGt7Heartbeat,
} from './gt7Constants';

export interface TGt7Packet {
	packetId: number;
	position: [number, number, number];
	velocity: [number, number, number];
	angularVelocity: [number, number, number];
	rpm: number;
	rpmLimiter: number;
	fuelLevel: number;
	fuelCapacity: number;
	speedMs: number;
	tyreTemps: [number, number, number, number];
	currentLap: number;
	totalLaps: number;
	bestLapMs: number;
	lastLapMs: number;
	racePosition: number;
	carsInRace: number;
	gear: number;
	suggestedGear: number;
	/** 0..1 */
	throttle: number;
	/** 0..1 */
	brake: number;
	isOnTrack: boolean;
	isPaused: boolean;
	isLoading: boolean;
	carCode: number;
}

const nonceFor = (iv1: number, heartbeat: TGt7Heartbeat): Uint8Array => {
	const iv2 = (iv1 ^ GT7_HEARTBEATS[heartbeat].xor) >>> 0;
	const nonce = new Uint8Array(8);
	const view = new DataView(nonce.buffer);
	view.setUint32(0, iv2, true);
	view.setUint32(4, iv1, true);
	return nonce;
};

/** Decrypts a raw UDP datagram; returns null when the magic does not match (wrong key/variant). */
export const decryptGt7 = (raw: Uint8Array, heartbeat: TGt7Heartbeat = 'A'): Uint8Array | null => {
	if (raw.length < GT7_HEARTBEATS.A.size) return null;
	const iv1 = new DataView(raw.buffer, raw.byteOffset, raw.length).getUint32(GT7_IV_OFFSET, true);
	const plain = salsa20Xor(GT7_KEY, nonceFor(iv1, heartbeat), raw);
	const magic = new DataView(plain.buffer).getUint32(0, true);
	return magic === GT7_MAGIC ? plain : null;
};

/** Encrypts a plain packet the way the console does. Used by tests and the fake console tool. */
export const encryptGt7 = (
	plain: Uint8Array,
	iv1: number,
	heartbeat: TGt7Heartbeat = 'A',
): Uint8Array => {
	const out = salsa20Xor(GT7_KEY, nonceFor(iv1, heartbeat), plain);
	new DataView(out.buffer).setUint32(GT7_IV_OFFSET, iv1 >>> 0, true);
	return out;
};

export const parseGt7 = (plain: Uint8Array): TGt7Packet => {
	const v = new DataView(plain.buffer, plain.byteOffset, plain.length);
	const f32 = (offset: number): number => v.getFloat32(offset, true);
	const gears = v.getUint8(O.gears);
	const flags = v.getUint16(O.flags, true);

	return {
		packetId: v.getInt32(O.packetId, true),
		position: [f32(O.positionX), f32(O.positionY), f32(O.positionZ)],
		velocity: [f32(O.velocityX), f32(O.velocityY), f32(O.velocityZ)],
		angularVelocity: [
			f32(O.angularVelocityX),
			f32(O.angularVelocityY),
			f32(O.angularVelocityZ),
		],
		rpm: f32(O.engineRpm),
		rpmLimiter: v.getInt16(O.rpmLimiter, true),
		fuelLevel: f32(O.fuelLevel),
		fuelCapacity: f32(O.fuelCapacity),
		speedMs: f32(O.speedMs),
		tyreTemps: [f32(O.tyreTempFL), f32(O.tyreTempFR), f32(O.tyreTempRL), f32(O.tyreTempRR)],
		currentLap: v.getInt16(O.currentLap, true),
		totalLaps: v.getInt16(O.totalLaps, true),
		bestLapMs: v.getInt32(O.bestLapMs, true),
		lastLapMs: v.getInt32(O.lastLapMs, true),
		racePosition: v.getInt16(O.racePosition, true),
		carsInRace: v.getInt16(O.carsInRace, true),
		gear: gears & 0x0f,
		suggestedGear: gears >> 4,
		throttle: v.getUint8(O.throttle) / 255,
		brake: v.getUint8(O.brake) / 255,
		isOnTrack: (flags & GT7_FLAGS.carOnTrack) !== 0,
		isPaused: (flags & GT7_FLAGS.paused) !== 0,
		isLoading: (flags & GT7_FLAGS.loadingOrProcessing) !== 0,
		carCode: v.getInt32(O.carCode, true),
	};
};

/** Builds a plain (unencrypted) packet; inverse of parseGt7. Used by tests and the fake console. */
export const buildGt7Plain = (p: Partial<TGt7Packet>): Uint8Array => {
	const plain = new Uint8Array(GT7_HEARTBEATS.A.size);
	const v = new DataView(plain.buffer);
	const f32 = (offset: number, value = 0): void => v.setFloat32(offset, value, true);
	v.setUint32(O.magic, GT7_MAGIC, true);
	const [px, py, pz] = p.position ?? [0, 0, 0];
	f32(O.positionX, px);
	f32(O.positionY, py);
	f32(O.positionZ, pz);
	const [vx, vy, vz] = p.velocity ?? [0, 0, 0];
	f32(O.velocityX, vx);
	f32(O.velocityY, vy);
	f32(O.velocityZ, vz);
	const [ax, ay, az] = p.angularVelocity ?? [0, 0, 0];
	f32(O.angularVelocityX, ax);
	f32(O.angularVelocityY, ay);
	f32(O.angularVelocityZ, az);
	f32(O.engineRpm, p.rpm);
	f32(O.fuelLevel, p.fuelLevel);
	f32(O.fuelCapacity, p.fuelCapacity);
	f32(O.speedMs, p.speedMs);
	const temps = p.tyreTemps ?? [0, 0, 0, 0];
	f32(O.tyreTempFL, temps[0]);
	f32(O.tyreTempFR, temps[1]);
	f32(O.tyreTempRL, temps[2]);
	f32(O.tyreTempRR, temps[3]);
	v.setInt32(O.packetId, p.packetId ?? 0, true);
	v.setInt16(O.currentLap, p.currentLap ?? 0, true);
	v.setInt16(O.totalLaps, p.totalLaps ?? 0, true);
	v.setInt32(O.bestLapMs, p.bestLapMs ?? -1, true);
	v.setInt32(O.lastLapMs, p.lastLapMs ?? -1, true);
	v.setInt16(O.racePosition, p.racePosition ?? -1, true);
	v.setInt16(O.carsInRace, p.carsInRace ?? -1, true);
	v.setInt16(O.rpmLimiter, p.rpmLimiter ?? 9000, true);
	const flags =
		(p.isOnTrack === false ? 0 : GT7_FLAGS.carOnTrack) |
		(p.isPaused ? GT7_FLAGS.paused : 0) |
		(p.isLoading ? GT7_FLAGS.loadingOrProcessing : 0);
	v.setUint16(O.flags, flags, true);
	v.setUint8(O.gears, ((p.suggestedGear ?? 15) << 4) | ((p.gear ?? 0) & 0x0f));
	v.setUint8(O.throttle, Math.round((p.throttle ?? 0) * 255));
	v.setUint8(O.brake, Math.round((p.brake ?? 0) * 255));
	v.setInt32(O.carCode, p.carCode ?? 0, true);
	return plain;
};
