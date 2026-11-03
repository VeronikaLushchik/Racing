/** @format */

import {
	TFieldEntry,
	TLapSummary,
	TRelayState,
	TSessionInfo,
	TSourceOptions,
	TTelemetryFrame,
} from '@racing/shared';

/** Where a source pushes what it produces. Implemented by the relay hub. */
export interface TSourceSink {
	session: (session: TSessionInfo) => void;
	frame: (frame: TTelemetryFrame) => void;
	lap: (lap: TLapSummary) => void;
	field: (entries: TFieldEntry[]) => void;
	status: (state: TRelayState, message: string | null) => void;
}

export interface TTelemetrySource {
	start: () => Promise<void>;
	stop: () => void;
}

export type TSourceFactory = (sink: TSourceSink, options: TSourceOptions) => TTelemetrySource;
