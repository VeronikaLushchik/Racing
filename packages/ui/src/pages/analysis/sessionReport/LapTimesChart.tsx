import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import useTranslation from '~@engines/translations/useTranslation';
import { buildLapTimesOption } from './lapTimesChartFunctions';

import { TSessionReport } from '~@engines/racingMath/sessionReportModel';

import classes from './sessionReport.module.scss';

interface LapTimesChartProps {
	report: TSessionReport;
	ariaLabel: string;
}

const LapTimesChart: FC<LapTimesChartProps> = props => {
	const { report, ariaLabel } = props;

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
			buildLapTimesOption(report, theme, {
				clean: t('report.cleanLap'),
				other: t('report.otherLap'),
				best: t('report.bestLap'),
				ideal: t('report.idealLap'),
				lap: t('common.lap'),
			}),
		);

		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		return () => {
			observer.disconnect();
			chart.dispose();
		};
	}, [report, theme, t]);

	return (
		<div
			ref={containerRef}
			className={classes.chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default LapTimesChart;
