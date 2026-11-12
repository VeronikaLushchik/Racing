import React, { FC, useMemo } from 'react';

import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { buildLapDetails } from '~@engines/racingMath/sessionDetailModel';
import { formatDelta, formatLapTime } from 'src/services/functions';

import classes from './analyst.module.scss';

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Every lap in numbers: speeds, pedal use, gear changes, grip, fuel and tyres. */
const LapDetailTable: FC = () => {
	const t = useTranslation();
	const { lapRecords, session } = useTelemetryMeta();

	const details = useMemo(() => buildLapDetails(lapRecords), [lapRecords]);
	const hasFuel = details.some(detail => detail.fuelUsedL !== null);
	const hasTyres = details.some(detail => detail.tyreTempC !== null);

	if (details.length === 0) {
		return (
			<Panel title={t('analyst.lapsTitle')}>
				<p className={classes.empty_text}>{t('report.needLap')}</p>
			</Panel>
		);
	}

	return (
		<Panel
			title={t('analyst.lapsTitle')}
			subtitle={t('analyst.lapsHint')}
		>
			<div className={classes.table_wrap}>
				<table className={classes.table}>
					<thead>
						<tr>
							<th>{t('common.lap')}</th>
							<th>{t('report.col.time')}</th>
							<th>{t('report.col.delta')}</th>
							<th>{t('analyst.col.top')}</th>
							<th>{t('analyst.col.min')}</th>
							<th>{t('analyst.col.avg')}</th>
							<th>{t('analyst.col.fullThrottle')}</th>
							<th>{t('analyst.col.braking')}</th>
							<th>{t('analyst.col.coasting')}</th>
							<th>{t('analyst.col.overlap')}</th>
							<th>{t('analyst.col.shifts')}</th>
							<th>
								{session?.capabilities.hasMeasuredG === false
									? t('analyst.col.maxGDerived')
									: t('analyst.col.maxG')}
							</th>
							<th>{t('analyst.col.cornerG')}</th>
							{hasFuel && <th>{t('analyst.col.fuel')}</th>}
							{hasTyres && <th>{t('analyst.col.tyres')}</th>}
						</tr>
					</thead>
					<tbody>
						{details.map(detail => (
							<tr
								key={detail.lap}
								data-is-clean={detail.isValid && !detail.isPitLap}
							>
								<td>
									{detail.lap}
									{detail.isPitLap && (
										<span className={classes.muted}> {t('timing.pit')}</span>
									)}
								</td>
								<td data-is-best={detail.isBest}>
									{formatLapTime(detail.lapTimeMs)}
								</td>
								<td>
									{detail.isBest || detail.deltaToBestMs === null
										? '—'
										: formatDelta(detail.deltaToBestMs / 1000)}
								</td>
								<td>{Math.round(detail.topSpeedKmh)}</td>
								<td>{Math.round(detail.minSpeedKmh)}</td>
								<td>{Math.round(detail.avgSpeedKmh)}</td>
								<td>{percent(detail.pedals.fullThrottle)}</td>
								<td>{percent(detail.pedals.braking)}</td>
								<td>{percent(detail.pedals.coasting)}</td>
								<td>{percent(detail.pedals.overlap)}</td>
								<td>{detail.gearChanges}</td>
								<td>{detail.maxLatG.toFixed(2)}</td>
								<td>{detail.avgCornerG.toFixed(2)}</td>
								{hasFuel && (
									<td>
										{detail.fuelUsedL === null
											? '—'
											: detail.fuelUsedL.toFixed(2)}
									</td>
								)}
								{hasTyres && (
									<td>
										{detail.tyreTempC === null
											? '—'
											: Math.round(detail.tyreTempC)}
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Panel>
	);
};

export default LapDetailTable;
