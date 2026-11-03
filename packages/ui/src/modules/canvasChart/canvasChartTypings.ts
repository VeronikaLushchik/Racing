/** @format */

import { TTraceChannel } from 'src/modules/telemetry/ringBuffer';

export interface TTraceSeries {
	channel: TTraceChannel;
	/** CSS variable holding the colour, e.g. --chart-speed. */
	colorVar: string;
	isStep?: boolean;
}

export interface TTraceLane {
	id: string;
	label: string;
	min: number;
	max: number;
	/** Relative height of the lane. */
	weight: number;
	series: TTraceSeries[];
	format?: (value: number) => string;
}
