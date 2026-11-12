import type { ECharts } from 'echarts/core';

/**
 * Zoom on the shared x axis of a chart with stacked lanes: the mouse wheel or a pinch zooms,
 * dragging pans and a double click shows everything again. Every lane moves together.
 */
export const enableAxisZoom = (chart: ECharts, laneCount: number): void => {
	chart.setOption({
		dataZoom: [
			{
				type: 'inside',
				xAxisIndex: Array.from({ length: laneCount }, (_, index) => index),
				filterMode: 'none',
				zoomOnMouseWheel: true,
				moveOnMouseMove: true,
				moveOnMouseWheel: false,
				minSpan: 2,
			},
		],
	});
	chart.getZr().on('dblclick', () => {
		chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
	});
};
