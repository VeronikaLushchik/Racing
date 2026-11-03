/** @format */

/**
 * GT7 "Simulator Interface" packet layout. GT7 does not publish an official spec;
 * offsets follow the community reverse-engineering (gt7dashboard, gt7telemetry docs).
 * Verify against a real PS5 dump before trusting rarely used fields.
 */
export const GT7_KEY = new TextEncoder()
	.encode('Simulator Interface Packet GT7 ver 0.0')
	.slice(0, 32);
export const GT7_MAGIC = 0x47375330; // "0S7G" read as little-endian int32
export const GT7_IV_OFFSET = 0x40;

/** Heartbeat byte sent to the console and the XOR used to derive the nonce for that variant. */
export const GT7_HEARTBEATS = {
	A: { byte: 'A', xor: 0xdeadbeaf, size: 0x128 },
	B: { byte: 'B', xor: 0xdeadbeef, size: 0x13c },
	'~': { byte: '~', xor: 0x55fabb4f, size: 0x158 },
} as const;

export type TGt7Heartbeat = keyof typeof GT7_HEARTBEATS;

export const GT7_HEARTBEAT_INTERVAL_MS = 10_000;
export const GT7_SILENCE_TIMEOUT_MS = 2_000;

export const GT7_OFFSETS = {
	magic: 0x00,
	positionX: 0x04,
	positionY: 0x08,
	positionZ: 0x0c,
	velocityX: 0x10,
	velocityY: 0x14,
	velocityZ: 0x18,
	angularVelocityX: 0x2c,
	angularVelocityY: 0x30,
	angularVelocityZ: 0x34,
	engineRpm: 0x3c,
	fuelLevel: 0x44,
	fuelCapacity: 0x48,
	speedMs: 0x4c,
	tyreTempFL: 0x60,
	tyreTempFR: 0x64,
	tyreTempRL: 0x68,
	tyreTempRR: 0x6c,
	packetId: 0x70,
	currentLap: 0x74,
	totalLaps: 0x76,
	bestLapMs: 0x78,
	lastLapMs: 0x7c,
	racePosition: 0x84,
	carsInRace: 0x86,
	rpmLimiter: 0x8a,
	flags: 0x8e,
	gears: 0x90,
	throttle: 0x91,
	brake: 0x92,
	carCode: 0x124,
} as const;

/** Bits of the `flags` field. */
export const GT7_FLAGS = {
	carOnTrack: 1 << 0,
	paused: 1 << 1,
	loadingOrProcessing: 1 << 2,
	inGear: 1 << 3,
	hasTurbo: 1 << 4,
	revLimiterAlert: 1 << 5,
	handBrake: 1 << 6,
	lights: 1 << 7,
} as const;
