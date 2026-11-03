import { TLapSummary, TTelemetryFrame } from '@racing/shared';

/**
 * Builds lap summaries for sources that only stream frames (GT7, mock).
 * Sectors are split by distance into `sectorCount` equal parts when the track length is known.
 */
export class LapTracker {
	private currentLap = -1;
	private lastFrame: TTelemetryFrame | null = null;
	private sectorStarts: number[] = [];
	private hasPitted = false;
	private lapStartDistance = 0;

	constructor(
		private readonly trackLength: number | null,
		private readonly sectorCount = 3,
	) {}

	markPit(): void {
		this.hasPitted = true;
	}

	/** Feeds a frame; returns the summary of the lap that just ended, if any. */
	push(frame: TTelemetryFrame, lastLapTimeMs?: number | null): TLapSummary | null {
		const previous = this.lastFrame;
		this.lastFrame = frame;

		if (this.currentLap === -1) {
			this.startLap(frame);
			return null;
		}

		if (frame.lap !== this.currentLap && previous) {
			const lapTimeMs =
				lastLapTimeMs && lastLapTimeMs > 0 ? lastLapTimeMs : previous.lapTimeMs;
			// Lap 0 is the run to the line before the first timed lap; it is not a lap.
			const summary = this.currentLap > 0 ? this.finishLap(previous, lapTimeMs) : null;
			this.startLap(frame);
			return summary;
		}

		this.trackSectors(frame);
		return null;
	}

	private startLap(frame: TTelemetryFrame): void {
		this.currentLap = frame.lap;
		this.lapStartDistance = frame.lapDistance;
		this.sectorStarts = [0];
		this.hasPitted = false;
	}

	private trackSectors(frame: TTelemetryFrame): void {
		if (!this.trackLength) return;
		const sectorLength = this.trackLength / this.sectorCount;
		const sectorIndex = Math.min(
			this.sectorCount - 1,
			Math.floor(frame.lapDistance / sectorLength),
		);
		while (this.sectorStarts.length <= sectorIndex) {
			this.sectorStarts.push(frame.lapTimeMs);
		}
	}

	private finishLap(lastFrame: TTelemetryFrame, lapTimeMs: number): TLapSummary {
		const sectorsMs: number[] = [];
		if (this.trackLength && this.sectorStarts.length === this.sectorCount) {
			const bounds = [...this.sectorStarts, lapTimeMs];
			for (let i = 0; i < this.sectorCount; i += 1) {
				sectorsMs.push(bounds[i + 1] - bounds[i]);
			}
		}
		// A lap counts only if we saw it from the line to (nearly) the line again.
		const isComplete = this.trackLength
			? this.lapStartDistance < this.trackLength * 0.05 &&
				lastFrame.lapDistance > this.trackLength * 0.9
			: true;

		return {
			lap: this.currentLap,
			lapTimeMs: Math.round(lapTimeMs),
			sectorsMs: sectorsMs.map(Math.round),
			isValid: isComplete && !this.hasPitted,
			isPitLap: this.hasPitted,
			compound: null,
		};
	}
}
