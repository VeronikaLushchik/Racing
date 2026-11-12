import React, { FC, useEffect, useRef } from 'react';

import { enableAxisZoom } from 'src/modules/chart/chartZoom';
import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import { buildLapCompareOption, TCompareLane } from './ghostLapFunctions';

import { TCorner } from '~@engines/racingMath/ghostLapModel';
import { TLapRecord } from 'src/modules/telemetry/lapTypings';

import classes from './ghostLap.module.scss';

interface LapCompareChartProps {
	lanes: TCompareLane[];
	reference: TLapRecord;
	compare: TLapRecord;
	referenceLabel: string;
	compareLabel: string;
	delta: Float32Array;
	corners: TCorner[];
	ariaLabel: string;
	/** Cursor position on the distance axis, m; null when it leaves the chart. */
	onCursor?: (distance: number | null) => void;
}

const LapCompareChart: FC<LapCompareChartProps> = props => {
	const {
		lanes,
		reference,
		compare,
		referenceLabel,
		compareLabel,
		delta,
		corners,
		ariaLabel,
		onCursor,
	} = props;

	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);
	const onCursorRef = useRef(onCursor);
	onCursorRef.current = onCursor;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const laps = { reference, compare, referenceLabel, compareLabel, delta, corners };
		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(buildLapCompareOption(lanes, laps, theme, container.clientHeight));
		enableAxisZoom(chart, lanes.length);

		const observer = new ResizeObserver(() => {
			chart.resize();
			chart.setOption(buildLapCompareOption(lanes, laps, theme, container.clientHeight));
		});
		observer.observe(container);

		chart.on('updateAxisPointer', (event: unknown) => {
			const value = (event as { axesInfo?: { value: number }[] }).axesInfo?.[0]?.value;
			onCursorRef.current?.(value === undefined ? null : value);
		});
		chart.on('globalout', () => onCursorRef.current?.(null));

		return () => {
			observer.disconnect();
			chart.dispose();
		};
	}, [lanes, reference, compare, referenceLabel, compareLabel, delta, corners, theme]);

	return (
		<div
			ref={containerRef}
			className={classes.compare_chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default LapCompareChart;
