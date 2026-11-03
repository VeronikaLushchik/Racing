import React, { FC } from 'react';

import useTranslation from '~@engines/translations/useTranslation';

import { INSIGHT_KEYS, NEUTRAL_TIME_S } from './ghostLapConstants';

import { TCornerComparison } from '~@engines/racingMath/ghostLapModel';

import classes from './ghostLap.module.scss';

interface CornerTableProps {
	comparisons: TCornerComparison[];
}

const signed = (value: number | null, unit: string, digits = 0): string => {
	if (value === null || !Number.isFinite(value)) {
		return '—';
	}
	const text = Math.abs(value).toFixed(digits);
	if (Number(text) === 0) {
		return `0 ${unit}`;
	}
	return `${value > 0 ? '+' : '−'}${text} ${unit}`;
};

const timeTone = (seconds: number): string | undefined => {
	if (Math.abs(seconds) < NEUTRAL_TIME_S) {
		return undefined;
	}
	return seconds < 0 ? 'faster' : 'slower';
};

const CornerTable: FC<CornerTableProps> = props => {
	const { comparisons } = props;

	const t = useTranslation();

	return (
		<div className={classes.table_wrap}>
			<table className={classes.table}>
				<thead>
					<tr>
						<th>{t('ghost.corner')}</th>
						<th>{t('ghost.brakePoint')}</th>
						<th>{t('ghost.apexSpeed')}</th>
						<th>{t('ghost.throttlePoint')}</th>
						<th>{t('ghost.exitSpeed')}</th>
						<th>{t('ghost.time')}</th>
						<th className={classes.insight_cell}>{t('ghost.insightColumn')}</th>
					</tr>
				</thead>
				<tbody>
					{comparisons.map(comparison => (
						<tr key={comparison.corner.number}>
							<td>
								<strong>T{comparison.corner.number}</strong>
								<span className={classes.muted}>
									{' '}
									{comparison.corner.distance.toFixed(0)} m
								</span>
							</td>
							<td>{signed(comparison.brakePointDeltaM, 'm')}</td>
							<td>{signed(comparison.minSpeedDeltaKmh, 'km/h')}</td>
							<td>{signed(comparison.throttlePointDeltaM, 'm')}</td>
							<td>{signed(comparison.exitSpeedDeltaKmh, 'km/h')}</td>
							<td data-delta={timeTone(comparison.timeDeltaS)}>
								{signed(comparison.timeDeltaS, 's', 2)}
							</td>
							<td className={classes.insight_cell}>
								{t(
									INSIGHT_KEYS[comparison.insight.kind],
									...comparison.insight.args,
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default CornerTable;
