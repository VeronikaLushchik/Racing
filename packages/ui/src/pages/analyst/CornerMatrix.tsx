import React, { FC, useMemo } from 'react';

import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { buildCornerMatrix } from '~@engines/racingMath/sessionDetailModel';

import { lossLevel } from './analystFunctions';

import classes from './analyst.module.scss';

/** Every valid lap against every corner: where time was lost, lap after lap. */
const CornerMatrix: FC = () => {
	const t = useTranslation();
	const { lapRecords } = useTelemetryMeta();

	const matrix = useMemo(() => buildCornerMatrix(lapRecords), [lapRecords]);

	if (!matrix) {
		return (
			<Panel title={t('analyst.cornersTitle')}>
				<p className={classes.empty_text}>{t('analyst.cornersNeedLap')}</p>
			</Panel>
		);
	}

	return (
		<Panel
			title={t('analyst.cornersTitle')}
			subtitle={t('analyst.cornersHint')}
		>
			<div className={classes.table_wrap}>
				<table className={classes.table}>
					<thead>
						<tr>
							<th>{t('common.lap')}</th>
							{matrix.corners.map(corner => (
								<th
									key={corner.number}
									title={`${Math.round(corner.distance)} m`}
								>
									T{corner.number}
								</th>
							))}
							<th>{t('analyst.col.lost')}</th>
						</tr>
					</thead>
					<tbody>
						{matrix.rows.map(row => (
							<tr key={row.lap}>
								<td data-is-best={row.isBest}>{row.lap}</td>
								{row.cells.map((cell, index) => (
									<td
										key={index}
										className={classes.heat_cell}
										data-level={lossLevel(cell.lossS)}
										title={t(
											'analyst.cornerCell',
											cell.timeS.toFixed(2),
											Math.round(cell.minSpeedKmh),
										)}
									>
										{cell.lossS < 0.005 ? '●' : `+${cell.lossS.toFixed(2)}`}
									</td>
								))}
								<td>+{row.totalLossS.toFixed(2)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td>{t('analyst.cornerBest')}</td>
							{matrix.bestS.map((value, index) => (
								<td key={index}>{value.toFixed(2)}</td>
							))}
							<td>
								{matrix.bestS.reduce((sum, value) => sum + value, 0).toFixed(2)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</Panel>
	);
};

export default CornerMatrix;
