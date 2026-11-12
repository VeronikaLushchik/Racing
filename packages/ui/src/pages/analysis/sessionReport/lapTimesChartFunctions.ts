import type { EChartsCoreOption } from 'echarts/core';

import { formatLapTime } from 'src/services/functions';

import { TSessionReport } from '~@engines/racingMath/sessionReportModel';
import { TColorScheme } from '~@ui/common/themes';

interface TLabels {
	clean: string;
	other: string;
	best: string;
	ideal: string;
	lap: string;
}

interface TTooltipParam {
	seriesName: string;
	color: string;
	value: [number, number];
}

/** Every lap of the session as a dot (clean laps in colour), with the best and ideal lap lines. */
export const buildLapTimesOption = (
	report: TSessionReport,
	theme: TColorScheme,
	labels: TLabels,
): EChartsCoreOption => {
	const { laps, summary } = report;
	const best = (summary.bestLapMs ?? 0) / 1000;
	const ideal = summary.idealLapMs !== null ? summary.idealLapMs / 1000 : null;
	// In-laps and spins would flatten the chart: keep the axis around racing pace.
	const visible = laps.map(lap => lap.lapTimeMs / 1000).filter(value => value <= best * 1.1);
	const low = Math.min(...visible, ideal ?? Infinity) - 0.5;
	const high = Math.max(...visible) + 0.5;
	const interval = high - low > 8 ? 2 : high - low > 3 ? 1 : 0.5;
	const min = Math.floor(low / interval) * interval;
	const max = Math.ceil(high / interval) * interval;
	const point = (lap: (typeof laps)[number]) => [lap.lap, Math.min(lap.lapTimeMs / 1000, max)];

	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };
	const markLine = (value: number, name: string, color: string) => ({
		name,
		yAxis: value,
		lineStyle: { color, type: 'dashed', width: 1 },
		label: {
			color,
			fontSize: 10,
			position: 'insideEndTop',
			formatter: `${name} ${formatLapTime(value * 1000)}`,
		},
	});

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: 64, right: 16, top: 24, bottom: 32 },
		tooltip: {
			trigger: 'item',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			formatter: (param: TTooltipParam) => {
				const lap = laps.find(item => item.lap === param.value[0]);
				return `<div style="opacity:.7">${labels.lap} ${param.value[0]} · ${param.seriesName}</div><b>${formatLapTime(lap?.lapTimeMs)}</b>`;
			},
		},
		xAxis: {
			type: 'value',
			minInterval: 1,
			min: laps[0]?.lap,
			max: laps[laps.length - 1]?.lap,
			axisLine,
			axisTick: { show: false },
			splitLine: { show: false },
			axisLabel,
		},
		yAxis: {
			type: 'value',
			min,
			max,
			interval,
			axisLine,
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: { ...axisLabel, formatter: (value: number) => formatLapTime(value * 1000) },
		},
		series: [
			{
				id: 'clean',
				name: labels.clean,
				type: 'line',
				symbolSize: 8,
				lineStyle: { color: theme['--chart-speed'], width: 1, opacity: 0.5 },
				itemStyle: { color: theme['--chart-speed'] },
				data: laps.filter(lap => lap.isClean).map(point),
				markLine: {
					silent: true,
					symbol: 'none',
					data: [
						markLine(best, labels.best, theme['--sector-purple']),
						...(ideal !== null && best - ideal >= 0.01
							? [markLine(ideal, labels.ideal, theme['--chart-throttle'])]
							: []),
					],
				},
			},
			{
				id: 'other',
				name: labels.other,
				type: 'scatter',
				symbolSize: 7,
				itemStyle: { color: theme['--text-disabled'] },
				data: laps.filter(lap => !lap.isClean).map(point),
			},
		],
	};
};
