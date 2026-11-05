import { TTelemetryFrame, TWheelTuple } from '@racing/shared';

import { TGt7Packet } from './gt7Packet';

const G = 9.81;
const SMOOTHING = 0.25;
/** Steering angle mapped to full lock (±1). Not in any spec; check against a real wheel. */
const STEER_FULL_LOCK_RAD = Math.PI / 4;

const quadOf = (values: number[]): TWheelTuple<number> => values.slice(0, 4) as TWheelTuple<number>;

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
			steer:
				packet.wheelRotation === null
					? null
					: Math.max(-1, Math.min(1, -packet.wheelRotation / STEER_FULL_LOCK_RAD)),
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
			wheelSpeeds: quadOf(
				packet.wheelRps.map((rps, i) => Math.abs(rps) * packet.tyreRadius[i] * 3.6),
			),
			suspension: quadOf(packet.suspensionHeight),
			waterTemp: packet.waterTemp,
			oilTemp: packet.oilTemp,
		};
	}
}
