import type { EChartsCoreOption } from 'echarts/core';

import { CLEAR_AIR_S, TRejoin } from '~@engines/racingMath/pitWindowModel';

import { TFieldEntry } from '@racing/shared';
import { TColorScheme } from '~@ui/common/themes';

const gapOf = (entry: TFieldEntry): number => entry.gapToLeaderS ?? 0;

/**
 * The field on one line by gap to the leader (s). The player's car after the stop is a hollow
 * marker, the shaded band around it is where a car means traffic on the out-lap.
 */
export const buildPitRibbonOption = (
	field: TFieldEntry[],
	rejoin: TRejoin,
	theme: TColorScheme,
	rejoinLabel: string,
): EChartsCoreOption => {
	const sorted = [...field].sort((a, b) => gapOf(a) - gapOf(b));
	const maxGap = Math.max(rejoin.gapToLeaderS, ...sorted.map(gapOf));

	const label = {
		show: true,
		fontSize: 11,
		color: theme['--text-secondary'],
	};

	return {
		animation: false,
		backgroundColor: 'transparent',
		grid: { left: 56, right: 56, top: 64, bottom: 64 },
		xAxis: {
			type: 'value',
			min: 0,
			max: Math.ceil((maxGap + 2) / 5) * 5,
			axisLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisTick: { show: false },
			splitLine: { lineStyle: { color: theme['--chart-grid'] } },
			axisLabel: {
				color: theme['--text-secondary'],
				fontSize: 10,
				formatter: (value: number) => `+${value} s`,
			},
		},
		yAxis: { type: 'value', show: false, min: -1, max: 1 },
		series: [
			{
				id: 'cars',
				type: 'scatter',
				symbolSize: 12,
				data: sorted.map((entry, i) => ({
					value: [gapOf(entry), 0],
					itemStyle: {
						color: entry.isPlayer ? theme['--stroke-active'] : theme['--chart-ghost'],
						borderColor: theme['--surface-primary'],
						borderWidth: 1,
					},
					label: {
						...label,
						// Four label rows so neighbours a fraction of a second apart stay readable.
						position: i % 2 === 0 ? 'top' : 'bottom',
						distance: i % 4 < 2 ? 6 : 22,
						color: entry.isPlayer ? theme['--text-primary'] : theme['--text-secondary'],
						fontWeight: entry.isPlayer ? 'bold' : 'normal',
						formatter: `P${entry.position} ${entry.name}`,
					},
				})),
			},
			{
				id: 'rejoin',
				type: 'scatter',
				symbol: 'diamond',
				symbolSize: 16,
				itemStyle: {
					color: 'transparent',
					borderColor: theme['--stroke-active'],
					borderWidth: 2,
				},
				label: {
					...label,
					position: 'top',
					distance: 14,
					color: theme['--text-active'],
					formatter: rejoinLabel,
				},
				markArea: {
					silent: true,
					itemStyle: {
						color: rejoin.isClearAir
							? theme['--system-success']
							: theme['--system-dangerous'],
						opacity: 0.12,
					},
					data: [
						[
							{ xAxis: Math.max(0, rejoin.gapToLeaderS - CLEAR_AIR_S) },
							{ xAxis: rejoin.gapToLeaderS + CLEAR_AIR_S },
						],
					],
				},
				data: [[rejoin.gapToLeaderS, 0]],
				z: 3,
			},
		],
	};
};
