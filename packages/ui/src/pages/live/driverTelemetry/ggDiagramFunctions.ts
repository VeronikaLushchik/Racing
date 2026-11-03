import type { EChartsCoreOption } from 'echarts/core';

import { TelemetryRingBuffer } from 'src/modules/telemetry/ringBuffer';
import { ggAxisLimit, trailAlpha } from './driverTelemetryFunctions';

import { GG_TRAIL_MS } from './driverTelemetryConstants';

import { TColorScheme } from '~@ui/common/themes';

const RING_POINTS = 72;

const ring = (radius: number): [number, number][] =>
	Array.from({ length: RING_POINTS + 1 }, (_, i) => {
		const angle = (i / RING_POINTS) * Math.PI * 2;
		return [radius * Math.cos(angle), radius * Math.sin(angle)];
	});

/** Static part: square axes, G rings and two scatter series (trail and the current point). */
export const buildGGOption = (theme: TColorScheme): EChartsCoreOption => {
	const axis = {
		type: 'value',
		axisLine: { onZero: true, lineStyle: { color: theme['--chart-grid'] } },
		axisTick: { show: false },
		axisLabel: { show: false },
		splitLine: { show: false },
	};

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: 8, right: 8, top: 8, bottom: 8 },
		xAxis: axis,
		yAxis: axis,
		series: [
			{
				id: 'rings',
				type: 'line',
				silent: true,
				showSymbol: false,
				lineStyle: { color: theme['--chart-grid'], width: 1 },
				data: [],
			},
			{
				id: 'trail',
				type: 'scatter',
				symbolSize: 3,
				itemStyle: { color: theme['--stroke-active'] },
				data: [],
			},
			{
				id: 'current',
				type: 'scatter',
				symbolSize: 10,
				itemStyle: { color: theme['--text-primary'] },
				data: [],
			},
		],
	};
};

/** Dynamic part. Braking (negative longitudinal G) is drawn upwards, as engineers usually plot it. */
export const buildGGData = (buffer: TelemetryRingBuffer): EChartsCoreOption => {
	const tEnd = buffer.latest('t') ?? 0;
	const first = buffer.firstIndexSince(tEnd - GG_TRAIL_MS);

	let maxAbs = 0;
	const trail: { value: [number, number]; itemStyle: { opacity: number } }[] = [];
	for (let i = first; i < buffer.count; i += 1) {
		const lat = buffer.get('gLat', i);
		const long = buffer.get('gLong', i);
		maxAbs = Math.max(maxAbs, Math.abs(lat), Math.abs(long));
		trail.push({
			value: [lat, -long],
			itemStyle: { opacity: trailAlpha(tEnd - buffer.get('t', i), GG_TRAIL_MS) * 0.6 },
		});
	}

	const limit = ggAxisLimit(maxAbs);
	const rings: ([number, number] | '-')[] = [];
	for (let g = 1; g <= limit; g += 1) {
		rings.push(...ring(g), '-');
	}

	const lat = buffer.latest('gLat');
	const long = buffer.latest('gLong');

	return {
		xAxis: { min: -limit, max: limit },
		yAxis: { min: -limit, max: limit },
		series: [
			{ id: 'rings', data: rings },
			{ id: 'trail', data: trail },
			{ id: 'current', data: lat !== null && long !== null ? [[lat, -long]] : [] },
		],
	};
};
