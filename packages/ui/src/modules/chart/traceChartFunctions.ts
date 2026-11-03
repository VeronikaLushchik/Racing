import type { EChartsCoreOption } from 'echarts/core';

import { TelemetryRingBuffer } from '../telemetry/ringBuffer';

import { TColorScheme } from '~@ui/common/themes';
import { TTraceLane } from './chartTypings';

interface TTooltipParam {
	seriesId: string;
	seriesName: string;
	color: string;
	value: [number, number];
}

const TOP_PADDING = 8;
const BOTTOM_PADDING = 28;
const LANE_GAP = 10;

/** One line per series (linked axis pointers report each series several times), lane order. */
export const formatTraceTooltip = (params: TTooltipParam[], lanes: TTraceLane[]): string => {
	const byId = new Map(params.map(param => [param.seriesId, param]));
	const time = params[0]?.value[0];
	const rows = lanes.flatMap(lane =>
		lane.series.map(series => {
			const param = byId.get(`${lane.id}.${series.channel}`);
			if (!param) {
				return '';
			}
			const value = param.value[1];
			const text = lane.format ? lane.format(value) : value.toFixed(0);
			return `<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="color:${param.color}">●</span> ${param.seriesName}</span><b>${text}</b></div>`;
		}),
	);
	const header = time === undefined ? '' : `<div style="opacity:.7">${time.toFixed(2)} s</div>`;
	return header + rows.join('');
};

/** Static part of the option: one grid per lane, all sharing a time axis in seconds. */
export const buildTraceChartOption = (
	lanes: TTraceLane[],
	theme: TColorScheme,
	height: number,
): EChartsCoreOption => {
	const totalWeight = lanes.reduce((sum, lane) => sum + lane.weight, 0);
	const usable = height - TOP_PADDING - BOTTOM_PADDING - LANE_GAP * (lanes.length - 1);
	let top = TOP_PADDING;

	const grid = lanes.map(lane => {
		const laneHeight = (usable * lane.weight) / totalWeight;
		const item = { left: 56, right: 16, top, height: laneHeight };
		top += laneHeight + LANE_GAP;
		return item;
	});

	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid,
		axisPointer: { link: [{ xAxisIndex: 'all' }] },
		tooltip: {
			trigger: 'axis',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			axisPointer: { type: 'line', lineStyle: { color: theme['--text-secondary'] } },
			formatter: (params: TTooltipParam[]) => formatTraceTooltip(params, lanes),
		},
		xAxis: lanes.map((_, index) => ({
			type: 'value',
			gridIndex: index,
			axisLine,
			axisTick: { show: false },
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: {
				...axisLabel,
				show: index === lanes.length - 1,
				formatter: (value: number) => `${value.toFixed(0)} s`,
			},
		})),
		yAxis: lanes.map((lane, index) => ({
			type: 'value',
			gridIndex: index,
			min: lane.min,
			max: lane.max,
			splitNumber: 2,
			name: lane.label,
			nameLocation: 'middle',
			nameGap: 40,
			nameTextStyle: { color: theme['--text-secondary'], fontSize: 11 },
			axisLine,
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: {
				...axisLabel,
				formatter: lane.format ?? ((value: number) => String(value)),
			},
		})),
		series: lanes.flatMap((lane, index) =>
			lane.series.map(series => ({
				id: `${lane.id}.${series.channel}`,
				name: series.label ?? series.channel,
				type: 'line',
				xAxisIndex: index,
				yAxisIndex: index,
				step: series.isStep ? 'end' : undefined,
				showSymbol: false,
				sampling: 'lttb',
				lineStyle: { width: 1.5, color: theme[series.colorVar] },
				itemStyle: { color: theme[series.colorVar] },
				data: [],
			})),
		),
	};
};

/** Dynamic part: the last `windowSeconds` of every series, time relative to now (… -2 s, -1 s, 0). */
export const buildTraceChartData = (
	lanes: TTraceLane[],
	buffer: TelemetryRingBuffer,
	windowSeconds: number,
): EChartsCoreOption => {
	const tEnd = buffer.latest('t') ?? 0;
	const first = buffer.firstIndexSince(tEnd - windowSeconds * 1000);

	return {
		xAxis: lanes.map(() => ({ min: -windowSeconds, max: 0 })),
		series: lanes.flatMap(lane =>
			lane.series.map(series => {
				const data: [number, number][] = [];
				for (let i = first; i < buffer.count; i += 1) {
					data.push([(buffer.get('t', i) - tEnd) / 1000, buffer.get(series.channel, i)]);
				}
				return { id: `${lane.id}.${series.channel}`, data };
			}),
		),
	};
};
