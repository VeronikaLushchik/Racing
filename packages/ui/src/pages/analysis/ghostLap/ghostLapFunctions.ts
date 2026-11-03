import type { EChartsCoreOption } from 'echarts/core';

import { buildLaneGrids } from 'src/modules/chart/traceChartFunctions';

import { TCorner } from '~@engines/racingMath/ghostLapModel';
import { TLapChannel, TLapRecord } from 'src/modules/telemetry/lapTypings';
import { TColorScheme } from '~@ui/common/themes';

export interface TCompareLane {
	id: TLapChannel | 'delta';
	label: string;
	min?: number;
	max?: number;
	weight: number;
	colorVar: string;
	isStep?: boolean;
	format: (value: number) => string;
}

interface TCompareLaps {
	reference: TLapRecord;
	compare: TLapRecord;
	referenceLabel: string;
	compareLabel: string;
	delta: Float32Array;
	corners: TCorner[];
}

interface TTooltipParam {
	seriesId: string;
	seriesName: string;
	color: string;
	value: [number, number];
}

/** Room above the first lane for the corner labels, px. */
const CORNER_LABEL_SPACE = 22;

const toPoints = (values: ArrayLike<number>, step: number): [number, number][] =>
	Array.from(values, (value, i) => [i * step, value]);

/** Distance header plus one row per series, in lane order; linked pointers repeat series. */
export const formatCompareTooltip = (params: TTooltipParam[], lanes: TCompareLane[]): string => {
	const byId = new Map(params.map(param => [param.seriesId, param]));
	const distance = params[0]?.value[0];
	const rows = lanes.flatMap(lane =>
		['reference', 'compare'].map(role => {
			const param = byId.get(`${lane.id}.${role}`);
			if (!param) {
				return '';
			}
			return `<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="color:${param.color}">●</span> ${param.seriesName}</span><b>${lane.format(param.value[1])}</b></div>`;
		}),
	);
	const header =
		distance === undefined ? '' : `<div style="opacity:.7">${distance.toFixed(0)} m</div>`;
	return header + rows.join('');
};

/**
 * Both laps on a shared distance axis, one grid per lane. The reference lap is drawn in the
 * neutral ghost colour, the compared lap in the channel colour; corners are marked on speed.
 */
export const buildLapCompareOption = (
	lanes: TCompareLane[],
	laps: TCompareLaps,
	theme: TColorScheme,
	height: number,
): EChartsCoreOption => {
	const { reference, compare, delta, corners } = laps;
	const step = reference.step;
	const length = Math.min(reference.distance.length, compare.distance.length);
	const maxDistance = (length - 1) * step;

	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };

	const cornerMarks = {
		silent: true,
		symbol: 'none',
		lineStyle: { color: theme['--stroke-primary'], type: 'dashed', width: 1 },
		label: { color: theme['--text-secondary'], fontSize: 10, formatter: '{b}' },
		data: corners.map(corner => ({ name: `T${corner.number}`, xAxis: corner.distance })),
	};

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: buildLaneGrids(lanes, height, CORNER_LABEL_SPACE),
		axisPointer: { link: [{ xAxisIndex: 'all' }] },
		tooltip: {
			trigger: 'axis',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			axisPointer: { type: 'line', lineStyle: { color: theme['--text-secondary'] } },
			formatter: (params: TTooltipParam[]) => formatCompareTooltip(params, lanes),
		},
		xAxis: lanes.map((_, index) => ({
			type: 'value',
			gridIndex: index,
			min: 0,
			max: maxDistance,
			axisLine,
			axisTick: { show: false },
			splitLine: { show: false },
			axisLabel: {
				...axisLabel,
				show: index === lanes.length - 1,
				formatter: (value: number) => `${value.toFixed(0)} m`,
			},
		})),
		yAxis: lanes.map((lane, index) => ({
			type: 'value',
			gridIndex: index,
			min: lane.min,
			max: lane.max,
			scale: lane.min === undefined,
			splitNumber: 2,
			name: lane.label,
			nameLocation: 'middle',
			nameGap: 40,
			nameTextStyle: { color: theme['--text-secondary'], fontSize: 11 },
			axisLine,
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: { ...axisLabel, formatter: lane.format },
		})),
		series: lanes.flatMap((lane, index) => {
			const line = (role: 'reference' | 'compare', values: ArrayLike<number>) => {
				const color = role === 'reference' ? theme['--chart-ghost'] : theme[lane.colorVar];
				return {
					id: `${lane.id}.${role}`,
					name: role === 'reference' ? laps.referenceLabel : laps.compareLabel,
					type: 'line',
					xAxisIndex: index,
					yAxisIndex: index,
					step: lane.isStep ? 'end' : undefined,
					showSymbol: false,
					sampling: 'lttb',
					lineStyle: { width: role === 'reference' ? 1.25 : 1.5, color },
					itemStyle: { color },
					markLine: lane.id === 'speed' && role === 'compare' ? cornerMarks : undefined,
					data: toPoints(values, step),
				};
			};
			if (lane.id === 'delta') {
				return [
					{
						...line('compare', delta),
						areaStyle: { color: theme[lane.colorVar], opacity: 0.12 },
					},
				];
			}
			return [
				line('reference', reference.channels[lane.id].subarray(0, length)),
				line('compare', compare.channels[lane.id].subarray(0, length)),
			];
		}),
	};
};
