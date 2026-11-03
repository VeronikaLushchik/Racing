import type { EChartsCoreOption } from 'echarts/core';

import { squareBounds } from '~@engines/racingMath/trackMapModel';

import { TTrackOutline } from '~@engines/racingMath/trackOutlineModel';
import { TColorScheme } from '~@ui/common/themes';

const MARGIN_PX = 10;

/** Static part: the outline (closed), start line, and empty car and cursor markers. */
export const buildMiniMapOption = (
	outline: TTrackOutline,
	theme: TColorScheme,
	width: number,
	height: number,
): EChartsCoreOption => {
	const bounds = squareBounds(
		outline.x,
		outline.z,
		width - MARGIN_PX * 2,
		height - MARGIN_PX * 2,
	);
	const points = outline.x.map((x, i) => [x, outline.z[i]]);
	if (points.length > 0) {
		points.push(points[0]);
	}
	const axis = { type: 'value', show: false };

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: MARGIN_PX, right: MARGIN_PX, top: MARGIN_PX, bottom: MARGIN_PX },
		xAxis: { ...axis, min: bounds.xMin, max: bounds.xMax },
		yAxis: { ...axis, min: bounds.zMin, max: bounds.zMax, inverse: true },
		series: [
			{
				id: 'outline',
				type: 'line',
				silent: true,
				showSymbol: false,
				lineStyle: {
					color: theme['--stroke-primary'],
					width: 5,
					cap: 'round',
					join: 'round',
				},
				data: points,
			},
			{
				id: 'start',
				type: 'scatter',
				symbol: 'rect',
				symbolSize: [4, 12],
				silent: true,
				itemStyle: { color: theme['--text-primary'] },
				data: points.slice(0, 1),
			},
			{
				id: 'cursor',
				type: 'scatter',
				symbolSize: 14,
				silent: true,
				itemStyle: {
					color: 'transparent',
					borderColor: theme['--chart-rpm'],
					borderWidth: 3,
				},
				data: [],
				z: 3,
			},
			{
				id: 'car',
				type: 'scatter',
				symbolSize: 11,
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
