import type { EChartsCoreOption } from 'echarts/core';

import { TStrategyResult } from '~@engines/racingMath/strategySimulationModel';
import { TColorScheme } from '~@ui/common/themes';

interface TLabels {
	expected: string;
	band: string;
	stopOn: string;
	noStop: string;
	bestShare: string;
}

interface TTooltipParam {
	seriesId: string;
	dataIndex: number;
}

/**
 * Expected time lost against the best stop lap, for every lap the stop could happen on,
 * between dotted 10th and 90th percentiles. The best lap carries a vertical marker.
 */
export const buildSimulationOption = (
	result: TStrategyResult,
	lastLap: number,
	theme: TColorScheme,
	labels: TLabels,
): EChartsCoreOption => {
	const lapOf = (stopIn: number) => lastLap + stopIn;
	const options = result.options;
	const axisLine = { lineStyle: { color: theme['--chart-grid'] } };
	const axisLabel = { color: theme['--text-secondary'], fontSize: 10 };
	const high = Math.max(5, ...options.map(option => Math.min(option.p90S, 60)));

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
				const option = options[params[0]?.dataIndex ?? 0];
				if (!option) return '';
				const title = option.isNoStop
					? labels.noStop
					: `${labels.stopOn} ${lapOf(option.stopIn)}`;
				return [
					`<div style="opacity:.7">${title}</div>`,
					`<div>${labels.expected}: <b>+${option.meanS.toFixed(1)} s</b></div>`,
					`<div>${labels.band}: ${option.p10S.toFixed(1)}…${option.p90S.toFixed(1)} s</div>`,
					`<div>${labels.bestShare}: <b>${Math.round(option.bestShare * 100)}%</b></div>`,
				].join('');
			},
		},
		xAxis: {
			type: 'category',
			data: options.map(option => (option.isNoStop ? '—' : String(lapOf(option.stopIn)))),
			axisLine,
			axisTick: { show: false },
			axisLabel,
		},
		yAxis: {
			type: 'value',
			min: Math.min(0, ...options.map(option => Math.floor(option.p10S / 5) * 5)),
			max: Math.ceil(high),
			axisLine,
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: {
				...axisLabel,
				formatter: (value: number) =>
					`${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} s`,
			},
		},
		series: [
			...(['p10S', 'p90S'] as const).map(edge => ({
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
				data: options.map(option => Math.min(option[edge], 60)),
			})),
			{
				id: 'expected',
				name: labels.expected,
				type: 'line',
				showSymbol: true,
				symbolSize: 5,
				lineStyle: { color: theme['--chart-delta'], width: 1.5 },
				itemStyle: { color: theme['--chart-delta'] },
				data: options.map(option => Math.min(option.meanS, 60)),
				markLine: {
					silent: true,
					symbol: 'none',
					label: { show: false },
					lineStyle: { color: theme['--chart-throttle'], width: 1.5 },
					data: [{ xAxis: result.options.indexOf(result.best) }],
				},
			},
		],
	};
};
