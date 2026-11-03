import type { EChartsCoreOption } from 'echarts/core';

import { formatLapTime } from 'src/services/functions';

import { TDegradationResult } from '~@engines/racingMath/tyreDegradationModel';
import { TColorScheme } from '~@ui/common/themes';

interface TLabels {
	lapTime: string;
	fit: string;
	forecast: string;
	band: string;
	lap: string;
}

interface TTooltipParam {
	seriesId: string;
	seriesName: string;
	color: string;
	value: [number, number];
}

/**
 * Lap time against lap number: measured laps as dots, the fitted trend over the laps used for
 * the fit, and the forecast between the dotted edges of its prediction band.
 */
export const buildDegradationOption = (
	result: TDegradationResult,
	theme: TColorScheme,
	labels: TLabels,
): EChartsCoreOption => {
	const { stint, fitLaps, fit, forecast } = result;
	const lastFit = fitLaps[fitLaps.length - 1];
	const firstFit = fitLaps[0];
	const lapAtAge = (age: number) => lastFit.lap + (age - lastFit.tyreAge);
	const trendAt = (age: number) => {
		const lap = stint.find(item => item.tyreAge === age);
		const fuel = lap?.fuelL ?? null;
		const offset = lap && fuel !== null ? lap.lapTimeS - lap.correctedS : 0;
		return fit.intercept + fit.slope * age + offset;
	};

	const values = [
		...stint.map(lap => lap.lapTimeS),
		...forecast.map(lap => lap.low),
		...forecast.map(lap => lap.high),
	];
	const median = [...stint.map(lap => lap.lapTimeS)].sort((a, b) => a - b)[
		Math.floor(stint.length / 2)
	];
	// Out-laps and spins would flatten the chart; keep the axis around the racing pace.
	const visible = values.filter(value => value < median + 5);
	const low = Math.min(...visible) - 0.5;
	const high = Math.max(...visible) + 0.5;
	// Whole-second ticks, two at a time on a wide range, so labels never collide.
	const interval = high - low > 8 ? 2 : 1;
	const min = Math.floor(low / interval) * interval;
	const max = Math.ceil(high / interval) * interval;

	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: 64, right: 16, top: 16, bottom: 32 },
		tooltip: {
			trigger: 'axis',
			backgroundColor: theme['--surface-raised'],
			borderColor: theme['--stroke-primary'],
			textStyle: { color: theme['--text-primary'], fontSize: 12 },
			formatter: (params: TTooltipParam[]) => {
				const rows = params
					.filter(param => !param.seriesId.startsWith('band.'))
					.map(
						param =>
							`<div style="display:flex;gap:12px;justify-content:space-between"><span><span style="color:${param.color}">●</span> ${param.seriesName}</span><b>${formatLapTime(param.value[1] * 1000)}</b></div>`,
					);
				const lap = params[0]?.value[0];
				return `<div style="opacity:.7">${labels.lap} ${lap}</div>${rows.join('')}`;
			},
		},
		xAxis: {
			type: 'value',
			minInterval: 1,
			min: stint[0].lap,
			max: forecast[forecast.length - 1]?.lap ?? lastFit.lap,
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
			...(['low', 'high'] as const).map(edge => ({
				id: `band.${edge}`,
				name: labels.band,
				type: 'line',
				silent: true,
				showSymbol: false,
				lineStyle: {
					color: theme['--chart-delta'],
					width: 1,
					type: 'dotted',
					opacity: 0.7,
				},
				data: forecast.map(lap => [lap.lap, lap[edge]]),
			})),
			{
				id: 'fit',
				name: labels.fit,
				type: 'line',
				showSymbol: false,
				lineStyle: { color: theme['--chart-ghost'], width: 1.5, type: 'dashed' },
				itemStyle: { color: theme['--chart-ghost'] },
				data: [firstFit.tyreAge, lastFit.tyreAge].map(age => [lapAtAge(age), trendAt(age)]),
			},
			{
				id: 'forecast',
				name: labels.forecast,
				type: 'line',
				showSymbol: true,
				symbolSize: 5,
				lineStyle: { color: theme['--chart-delta'], width: 1.5 },
				itemStyle: { color: theme['--chart-delta'] },
				data: forecast.map(lap => [lap.lap, lap.lapTimeS]),
			},
			{
				id: 'laps',
				name: labels.lapTime,
				type: 'scatter',
				symbolSize: 8,
				itemStyle: { color: theme['--chart-speed'] },
				data: stint.map(lap => [lap.lap, lap.lapTimeS]),
			},
		],
	};
};
