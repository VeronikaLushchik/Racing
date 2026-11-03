/** @format */

import { TTelemetryFrame, TWheelTuple } from '@racing/shared';

import { TGt7Packet } from './gt7Packet';

const G = 9.81;
const SMOOTHING = 0.25;

/**
 * Converts raw GT7 packets into normalized frames. GT7 has no lap distance, no G sensor and
 * no lap timer, so they are derived here:
 * - lap distance integrates speed since the lap counter changed;
 * - longitudinal G is the smoothed derivative of speed;
 * - lateral G is speed × yaw rate (sign verified against the fake console, check on a real PS5).
 */
export class Gt7Normalizer {
	private lap = -1;
	private lapStartMs = 0;
	private lapDistance = 0;
	private lastTimeMs: number | null = null;
	private lastSpeed = 0;
	private gLong = 0;
	private gLat = 0;
	private startMs: number | null = null;

	/** Returns null for packets that should not be shown (paused, loading, in menus). */
	push(packet: TGt7Packet, receivedAtMs: number): TTelemetryFrame | null {
		if (packet.isPaused || packet.isLoading || !packet.isOnTrack) {
			this.lastTimeMs = null;
			return null;
		}
		if (this.startMs === null) this.startMs = receivedAtMs;

		const dt = this.lastTimeMs === null ? 0 : (receivedAtMs - this.lastTimeMs) / 1000;
		this.lastTimeMs = receivedAtMs;

		if (packet.currentLap !== this.lap) {
			this.lap = packet.currentLap;
			this.lapStartMs = receivedAtMs;
			this.lapDistance = 0;
		}

		if (dt > 0 && dt < 0.5) {
			this.lapDistance += ((packet.speedMs + this.lastSpeed) / 2) * dt;
			const rawLong = (packet.speedMs - this.lastSpeed) / dt / G;
			this.gLong += (rawLong - this.gLong) * SMOOTHING;
		}
		const rawLat = (packet.speedMs * packet.angularVelocity[1]) / G;
		this.gLat += (rawLat - this.gLat) * SMOOTHING;
		this.lastSpeed = packet.speedMs;

		return {
			t: Math.round(receivedAtMs - this.startMs),
			lap: Math.max(0, packet.currentLap),
			lapTimeMs: Math.round(receivedAtMs - this.lapStartMs),
			lapDistance: this.lapDistance,
			speed: packet.speedMs * 3.6,
			rpm: Math.round(packet.rpm),
			gear: packet.gear === 15 ? 0 : packet.gear,
			throttle: packet.throttle,
			brake: packet.brake,
			steer: null,
			gLat: this.gLat,
			gLong: this.gLong,
			x: packet.position[0],
			z: packet.position[2],
			tyreTemps: packet.tyreTemps.slice() as TWheelTuple<number>,
			tyreZones: null,
			brakeTemps: null,
			tyreWear: null,
			fuel: packet.fuelLevel,
			position: packet.racePosition > 0 ? packet.racePosition : null,
		};
	}
}
