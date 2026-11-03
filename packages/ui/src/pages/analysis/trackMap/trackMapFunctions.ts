import type { EChartsCoreOption } from 'echarts/core';

import { deltaRate, squareBounds, symmetricRange } from '~@engines/racingMath/trackMapModel';

import { LEGEND_HEIGHT_PX, MAP_MARGIN_PX, TTrackChannel } from './trackMapConstants';

import { TCorner } from '~@engines/racingMath/ghostLapModel';
import { TSectorMark } from '~@engines/racingMath/trackMapModel';
import { TLapRecord } from 'src/modules/telemetry/lapTypings';
import { TColorScheme } from '~@ui/common/themes';

export interface TColorScale {
	min: number;
	max: number;
	colors: string[];
	format: (value: number) => string;
}

interface TTrackMapInput {
	lap: TLapRecord;
	values: Float32Array;
	scale: TColorScale;
	corners: TCorner[];
	sectors: TSectorMark[];
	width: number;
	height: number;
}

const signed = (value: number, digits: number): string =>
	`${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;

/** Values of the chosen channel along the lap; `delta` is time lost per 100 m against `best`. */
export const trackChannelValues = (
	lap: TLapRecord,
	channel: TTrackChannel,
	delta: Float32Array | null,
): Float32Array => {
	if (channel === 'delta') {
		return delta ? deltaRate(delta, lap.step) : new Float32Array(lap.distance.length);
	}
	return lap.channels[channel];
};

/** Colour range and palette per channel; diverging channels are centred on zero. */
export const trackColorScale = (
	channel: TTrackChannel,
	values: Float32Array,
	theme: TColorScheme,
): TColorScale => {
	const neutral = theme['--chart-grid'];
	switch (channel) {
		case 'throttle':
			return {
				min: 0,
				max: 1,
				colors: [neutral, theme['--chart-throttle']],
				format: value => `${Math.round(value * 100)}%`,
			};
		case 'brake':
			return {
				min: 0,
				max: 1,
				colors: [neutral, theme['--chart-brake']],
				format: value => `${Math.round(value * 100)}%`,
			};
		case 'gLat': {
			const range = symmetricRange(values, 0.5);
			return {
				min: -range,
				max: range,
				colors: [theme['--chart-speed'], neutral, theme['--chart-rpm']],
				format: value => `${signed(value, 1)} G`,
			};
		}
		case 'delta': {
			const range = symmetricRange(values, 0.05);
			return {
				min: -range,
				max: range,
				colors: [theme['--system-success'], neutral, theme['--system-dangerous']],
				format: value => `${signed(value, 2)} s/100 m`,
			};
		}
		default: {
			let min = Infinity;
			let max = -Infinity;
			values.forEach(value => {
				min = Math.min(min, value);
				max = Math.max(max, value);
			});
			return {
				min: Math.floor(min / 10) * 10,
				max: Math.ceil(max / 10) * 10,
				colors: [
					theme['--chart-brake'],
					theme['--system-warning'],
					theme['--chart-throttle'],
					theme['--chart-speed'],
				],
				format: value => `${value.toFixed(0)} km/h`,
			};
		}
	}
};

/**
 * The lap drawn as dense points coloured through a visual map, with apexes, sector starts, the
 * start line and a live car marker. Z grows towards the viewer in game coordinates, so the
 * vertical axis is inverted to show the track as seen from above.
 */
export const buildTrackMapOption = (
	input: TTrackMapInput,
	theme: TColorScheme,
): EChartsCoreOption => {
	const { lap, values, scale, corners, sectors, width, height } = input;
	const { x, z } = lap.channels;
	const plotWidth = width - MAP_MARGIN_PX * 2;
	const plotHeight = height - MAP_MARGIN_PX * 2 - LEGEND_HEIGHT_PX;
	const bounds = squareBounds(x, z, plotWidth, plotHeight);

	const points = Array.from(values, (value, i) => [x[i], z[i], value, i * lap.step]);
	const axis = { type: 'value', show: false, scale: true };
	const label = {
		show: true,
		color: theme['--text-primary'],
		fontSize: 11,
		backgroundColor: theme['--surface-raised'],
		borderColor: theme['--stroke-primary'],
		borderWidth: 1,
		borderRadius: 4,
		padding: [2, 4],
		distance: 8,
	};

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: {
			left: MAP_MARGIN_PX,
			right: MAP_MARGIN_PX,
			top: MAP_MARGIN_PX,
			bottom: MAP_MARGIN_PX + LEGEND_HEIGHT_PX,
		},
		xAxis: { ...axis, min: bounds.xMin, max: bounds.xMax },
		yAxis: { ...axis, min: bounds.zMin, max: bounds.zMax, inverse: true },
		tooltip: {
			trigger: 'item',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			formatter: (param: { seriesId: string; value: number[] }) =>
				param.seriesId === 'track'
					? `${param.value[3].toFixed(0)} m · <b>${scale.format(param.value[2])}</b>`
					: '',
		},
		visualMap: {
			type: 'continuous',
			seriesIndex: 0,
			dimension: 2,
			min: scale.min,
			max: scale.max,
			inRange: { color: scale.colors },
			orient: 'horizontal',
			left: 'center',
			bottom: MAP_MARGIN_PX,
			itemWidth: 10,
			itemHeight: Math.min(240, Math.max(120, width / 3)),
			calculable: false,
			text: [scale.format(scale.max), scale.format(scale.min)],
			textStyle: { color: theme['--text-secondary'], fontSize: 11 },
		},
		series: [
			{
				id: 'track',
				type: 'scatter',
				symbolSize: 5,
				data: points,
			},
			{
				id: 'apexes',
				type: 'scatter',
				symbolSize: 7,
				silent: true,
				itemStyle: {
					color: theme['--surface-secondary'],
					borderColor: theme['--text-primary'],
					borderWidth: 1.5,
				},
				label: {
					...label,
					position: 'right',
					formatter: (param: { value: number[]; dataIndex: number }) =>
						`T${corners[param.dataIndex].number} · ${param.value[2].toFixed(0)}`,
				},
				data: corners.map(corner => [x[corner.index], z[corner.index], corner.minSpeed]),
				z: 3,
			},
			{
				id: 'sectors',
				type: 'scatter',
				symbol: 'rect',
				symbolSize: [4, 14],
				silent: true,
				itemStyle: { color: theme['--sector-purple'] },
				label: {
					...label,
					position: 'left',
					color: theme['--sector-purple'],
					formatter: (param: { dataIndex: number }) =>
						`S${sectors[param.dataIndex].sector}`,
				},
				data: sectors.map(mark => [mark.x, mark.z]),
				z: 3,
			},
			{
				id: 'start',
				type: 'scatter',
				symbol: 'rect',
				symbolSize: [6, 18],
				silent: true,
				itemStyle: { color: theme['--text-primary'] },
				data: x.length > 0 ? [[x[0], z[0]]] : [],
				z: 3,
			},
			{
				id: 'car',
				type: 'scatter',
				symbolSize: 14,
				silent: true,
				itemStyle: {
					color: theme['--stroke-active'],
					borderColor: theme['--text-primary'],
					borderWidth: 2,
				},
				data: [],
				z: 4,
			},
		],
	};
};
