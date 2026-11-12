import {
	TFieldEntry,
	TLapSummary,
	TRelayState,
	TSessionInfo,
	TSourceOptions,
	TTelemetryFrame,
	TWeatherSample,
} from '@racing/shared';

/** Where a source pushes what it produces. Implemented by the relay hub. */
export interface TSourceSink {
	session: (session: TSessionInfo) => void;
	frame: (frame: TTelemetryFrame) => void;
	lap: (lap: TLapSummary) => void;
	field: (entries: TFieldEntry[]) => void;
	weather: (weather: TWeatherSample) => void;
	status: (state: TRelayState, message: string | null) => void;
}

export interface TTelemetrySource {
	start: () => Promise<void>;
	stop: () => void;
	/** Sources that play recorded data can change speed while running. */
	setRate?: (rate: number) => number;
}

export type TSourceFactory = (sink: TSourceSink, options: TSourceOptions) => TTelemetrySource;
