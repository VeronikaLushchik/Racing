import React, { FC, useEffect, useRef } from 'react';

import echarts from 'src/modules/chart/echartsCore';
import { useTheme } from '~@ui/common/themeContext';
import { useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { buildTrackMapOption, TColorScale } from './trackMapFunctions';

import { LIVE_CAR_HZ } from './trackMapConstants';

import { TCorner } from '~@engines/racingMath/ghostLapModel';
import { TSectorMark } from '~@engines/racingMath/trackMapModel';
import { TLapRecord } from 'src/modules/telemetry/lapTypings';

import classes from './trackMap.module.scss';

interface TrackMapChartProps {
	lap: TLapRecord;
	values: Float32Array;
	scale: TColorScale;
	corners: TCorner[];
	sectors: TSectorMark[];
	ariaLabel: string;
}

const TrackMapChart: FC<TrackMapChartProps> = props => {
	const { lap, values, scale, corners, sectors, ariaLabel } = props;

	const store = useTelemetryStore();
	const theme = useTheme();

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const build = () =>
			buildTrackMapOption(
				{
					lap,
					values,
					scale,
					corners,
					sectors,
					width: container.clientWidth,
					height: container.clientHeight,
				},
				theme,
			);

		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chart.setOption(build());

		const observer = new ResizeObserver(() => {
			chart.resize();
			chart.setOption(build());
		});
		observer.observe(container);

		let lastVersion = -1;
		const timer = window.setInterval(() => {
			const frame = store.latestFrame;
			if (!frame || store.frameVersion === lastVersion) {
				return;
			}
			lastVersion = store.frameVersion;
			chart.setOption(
				{ series: [{ id: 'car', data: [[frame.x, frame.z]] }] },
				{ lazyUpdate: true },
			);
		}, 1000 / LIVE_CAR_HZ);

		return () => {
			window.clearInterval(timer);
			observer.disconnect();
			chart.dispose();
		};
	}, [lap, values, scale, corners, sectors, theme, store]);

	return (
		<div
			ref={containerRef}
			className={classes.track_chart}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default TrackMapChart;
