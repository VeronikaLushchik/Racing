import React, { FC, useEffect, useRef } from 'react';

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
}

const LapCompareChart: FC<LapCompareChartProps> = props => {
	const { lanes, reference, compare, referenceLabel, compareLabel, delta, corners, ariaLabel } =
		props;

	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const laps = { reference, compare, referenceLabel, compareLabel, delta, corners };
		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(buildLapCompareOption(lanes, laps, theme, container.clientHeight));

		const observer = new ResizeObserver(() => {
			chart.resize();
			chart.setOption(buildLapCompareOption(lanes, laps, theme, container.clientHeight));
		});
		observer.observe(container);

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
