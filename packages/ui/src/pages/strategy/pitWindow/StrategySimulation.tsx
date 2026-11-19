import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import useTranslation from '~@engines/translations/useTranslation';
import { buildSimulationOption } from './simulationChartFunctions';

import { TStrategyResult } from '~@engines/racingMath/strategySimulationModel';

import classes from '../common/strategy.module.scss';

interface StrategySimulationProps {
	result: TStrategyResult;
	lastLap: number;
	ariaLabel: string;
}

/** Chart of the Monte Carlo pit stop simulation: time lost against the best stop lap. */
const StrategySimulation: FC<StrategySimulationProps> = props => {
	const { result, lastLap, ariaLabel } = props;

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
			buildSimulationOption(result, lastLap, theme, {
				expected: t('simulation.expected'),
				band: t('simulation.band'),
				stopOn: t('simulation.stopOn'),
				noStop: t('simulation.noStop'),
				bestShare: t('simulation.bestShare'),
			}),
		);

		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		return () => {
			observer.disconnect();
			chart.dispose();
		};
	}, [result, lastLap, theme, t]);

	return (
		<div
			ref={containerRef}
			className={classes.chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default StrategySimulation;
