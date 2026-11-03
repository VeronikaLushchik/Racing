import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import { useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { buildGGData, buildGGOption } from './ggDiagramFunctions';

import classes from './driverTelemetry.module.scss';

interface GGDiagramProps {
	ariaLabel: string;
	refreshHz?: number;
}

const GGDiagram: FC<GGDiagramProps> = props => {
	const { ariaLabel, refreshHz = 15 } = props;

	const store = useTelemetryStore();
	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(buildGGOption(theme));

		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		let lastVersion = -1;
		const timer = window.setInterval(() => {
			if (store.frameVersion === lastVersion) {
				return;
			}
			lastVersion = store.frameVersion;
			chart.setOption(buildGGData(store.buffer), { lazyUpdate: true });
		}, 1000 / refreshHz);

		return () => {
			window.clearInterval(timer);
			observer.disconnect();
			chart.dispose();
		};
	}, [theme, store, refreshHz]);

	return (
		<div
			ref={containerRef}
			className={classes.gg_chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default GGDiagram;
