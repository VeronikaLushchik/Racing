import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import { buildPitRibbonOption } from './pitRibbonFunctions';

import { TFieldEntry } from '@racing/shared';
import { TRejoin } from '~@engines/racingMath/pitWindowModel';

import classes from '../common/strategy.module.scss';

interface PitRibbonProps {
	field: TFieldEntry[];
	rejoin: TRejoin;
	rejoinLabel: string;
	ariaLabel: string;
}

const PitRibbon: FC<PitRibbonProps> = props => {
	const { field, rejoin, rejoinLabel, ariaLabel } = props;

	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}
		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chartRef.current = chart;
		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);
		return () => {
			observer.disconnect();
			chart.dispose();
			chartRef.current = null;
		};
	}, []);

	// The field updates twice a second; reuse the chart instead of recreating it.
	useEffect(() => {
		chartRef.current?.setOption(buildPitRibbonOption(field, rejoin, theme, rejoinLabel), {
			notMerge: true,
		});
	}, [field, rejoin, theme, rejoinLabel]);

	return (
		<div
			ref={containerRef}
			className={classes.chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default PitRibbon;
