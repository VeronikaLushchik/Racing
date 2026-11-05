import type { EChartsCoreOption } from 'echarts/core';

import { TWeatherSample } from '@racing/shared';
import { TColorScheme } from '~@ui/common/themes';

interface TLabels {
	track: string;
	air: string;
	minutes: string;
}

interface TTooltipParam {
	seriesName: string;
	color: string;
	value: [number, number];
}

/** Track and air temperature against session minutes. */
export const buildWeatherOption = (
	samples: TWeatherSample[],
	theme: TColorScheme,
	labels: TLabels,
): EChartsCoreOption => {
	const minutes = (t: number) => Number((t / 60000).toFixed(2));
	const temperatures = samples.flatMap(sample => [sample.trackTempC, sample.airTempC]);
	const min = Math.floor(Math.min(...temperatures) / 5) * 5 - 5;
	const max = Math.ceil(Math.max(...temperatures) / 5) * 5 + 5;

	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: 48, right: 16, top: 16, bottom: 32 },
		tooltip: {
			trigger: 'axis',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			formatter: (params: TTooltipParam[]) => {
				const rows = params.map(
					param =>
						`<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="color:${param.color}">●</span> ${param.seriesName}</span><b>${param.value[1].toFixed(1)} °C</b></div>`,
				);
				const at = params[0]?.value[0] ?? 0;
				return `<div style="opacity:.7">${Math.round(at)} ${labels.minutes}</div>${rows.join('')}`;
			},
		},
		xAxis: {
			type: 'value',
			min: 0,
			axisLine,
			axisTick: { show: false },
			splitLine: { show: false },
			axisLabel: { ...axisLabel, formatter: (value: number) => `${value} ${labels.minutes}` },
		},
		yAxis: {
			type: 'value',
			min,
			max,
			axisLine,
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: { ...axisLabel, formatter: (value: number) => `${value}°` },
		},
		series: [
			{
				id: 'track',
				name: labels.track,
				type: 'line',
				showSymbol: samples.length < 40,
				symbolSize: 4,
				lineStyle: { color: theme['--temperature-hot'], width: 2 },
				itemStyle: { color: theme['--temperature-hot'] },
				data: samples.map(sample => [minutes(sample.t), sample.trackTempC]),
			},
			{
				id: 'air',
				name: labels.air,
				type: 'line',
				showSymbol: samples.length < 40,
				symbolSize: 4,
				lineStyle: { color: theme['--temperature-cold'], width: 2 },
				itemStyle: { color: theme['--temperature-cold'] },
				data: samples.map(sample => [minutes(sample.t), sample.airTempC]),
			},
		],
	};
};
