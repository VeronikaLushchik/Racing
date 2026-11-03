import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import useTranslation from '~@engines/translations/useTranslation';
import { buildDegradationOption } from './degradationChartFunctions';

import { TDegradationResult } from '~@engines/racingMath/tyreDegradationModel';

import classes from '../common/strategy.module.scss';

interface DegradationChartProps {
	result: TDegradationResult;
	ariaLabel: string;
}

const DegradationChart: FC<DegradationChartProps> = props => {
	const { result, ariaLabel } = props;

	const t = useTranslation();
	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(
			buildDegradationOption(result, theme, {
				lapTime: t('degradation.lapTime'),
				fit: t('degradation.trend'),
				forecast: t('degradation.forecast'),
				band: t('degradation.band'),
				lap: t('common.lap'),
			}),
		);

		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		return () => {
			observer.disconnect();
			chart.dispose();
		};
	}, [result, theme, t]);

	return (
		<div
			ref={containerRef}
			className={classes.chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default DegradationChart;
