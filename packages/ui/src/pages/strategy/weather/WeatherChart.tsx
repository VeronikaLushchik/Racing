import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import useTranslation from '~@engines/translations/useTranslation';
import { buildWeatherOption } from './weatherChartFunctions';

import { TWeatherSample } from '@racing/shared';

import classes from '../common/strategy.module.scss';

interface WeatherChartProps {
	samples: TWeatherSample[];
	ariaLabel: string;
}

const WeatherChart: FC<WeatherChartProps> = props => {
	const { samples, ariaLabel } = props;

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
			buildWeatherOption(samples, theme, {
				track: t('weather.track'),
				air: t('weather.air'),
				minutes: t('weather.minutes'),
			}),
		);

		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		return () => {
			observer.disconnect();
			chart.dispose();
		};
	}, [samples, theme, t]);

	return (
		<div
			ref={containerRef}
			className={classes.chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default WeatherChart;
