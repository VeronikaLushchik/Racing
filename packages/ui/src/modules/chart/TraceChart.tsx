import React, { FC, MutableRefObject, useEffect, useRef } from 'react';

import { enableAxisZoom } from './chartZoom';
import echarts from './echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import { useTelemetryStore } from '../telemetry/useTelemetry';
import { buildTraceChartData, buildTraceChartOption } from './traceChartFunctions';

import type { ECharts } from 'echarts/core';
import { TTraceLane } from './chartTypings';

import classes from './traceChart.module.scss';

interface TraceChartProps {
	lanes: TTraceLane[];
	windowSeconds: number;
	refreshHz?: number;
	ariaLabel: string;
	/** Cursor position on the time axis, seconds before now; null when it leaves the chart. */
	onCursor?: (secondsAgo: number | null) => void;
	/** Gets the chart instance, e.g. to save it as a picture. */
	chartRef?: MutableRefObject<ECharts | null>;
}

const TraceChart: FC<TraceChartProps> = props => {
	const { lanes, windowSeconds, refreshHz = 15, ariaLabel, onCursor, chartRef } = props;

	const store = useTelemetryStore();
	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);
	const onCursorRef = useRef(onCursor);
	onCursorRef.current = onCursor;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(buildTraceChartOption(lanes, theme, container.clientHeight));
		enableAxisZoom(chart, lanes.length);
		if (chartRef) chartRef.current = chart;

		const observer = new ResizeObserver(() => {
			chart.resize();
			chart.setOption({
				grid: buildTraceChartOption(lanes, theme, container.clientHeight).grid,
			});
		});
		observer.observe(container);

		chart.on('updateAxisPointer', (event: unknown) => {
			const value = (event as { axesInfo?: { value: number }[] }).axesInfo?.[0]?.value;
			onCursorRef.current?.(value === undefined ? null : value);
		});
		chart.on('globalout', () => onCursorRef.current?.(null));

		let lastVersion = -1;
		const timer = window.setInterval(() => {
			if (store.frameVersion === lastVersion) {
				return;
			}
			lastVersion = store.frameVersion;
			chart.setOption(buildTraceChartData(lanes, store.buffer, windowSeconds), {
				lazyUpdate: true,
			});
		}, 1000 / refreshHz);

		return () => {
			window.clearInterval(timer);
			observer.disconnect();
			if (chartRef) chartRef.current = null;
			chart.dispose();
		};
	}, [lanes, theme, store, windowSeconds, refreshHz, chartRef]);

	return (
		<div
			ref={containerRef}
			className={classes.trace_chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default TraceChart;
