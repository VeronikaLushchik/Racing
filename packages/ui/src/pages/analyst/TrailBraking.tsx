import React, { FC, useMemo } from 'react';

import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { buildTrailBraking } from '~@engines/racingMath/trailBrakingModel';

import { TRAIL_VERDICT_KEYS } from './analystConstants';
import { cleanLaps } from './analystFunctions';

import classes from './analyst.module.scss';

/** How every braked corner of the best lap is trail braked, next to its fastest version. */
const TrailBraking: FC = () => {
	const t = useTranslation();
	const { lapRecords } = useTelemetryMeta();

	const releaseText = (releaseBeforeApexM: number): string =>
		releaseBeforeApexM >= 0
			? t('trail.beforeApex', releaseBeforeApexM)
			: t('trail.pastApex', -releaseBeforeApexM);

	const report = useMemo(() => {
		const { best, clean } = cleanLaps(lapRecords);
		return best ? buildTrailBraking(best, clean) : null;
	}, [lapRecords]);

	if (!report || report.corners.length === 0) {
		return (
			<Panel title={t('trail.title')}>
				<p className={classes.empty_text}>{t('analyst.cornersNeedLap')}</p>
			</Panel>
		);
	}

	return (
		<Panel
			title={t('trail.title')}
			subtitle={t('trail.hint', report.lap)}
		>
			<div className={classes.table_wrap}>
				<table className={classes.table}>
					<thead>
						<tr>
							<th>{t('trail.col.corner')}</th>
							<th>{t('trail.col.release')}</th>
							<th>{t('trail.col.turning')}</th>
							<th>{t('trail.col.releaseLength')}</th>
							<th>{t('trail.col.advice')}</th>
							<th>{t('trail.col.fastest')}</th>
						</tr>
					</thead>
					<tbody>
						{report.corners.map(row => (
							<tr key={row.corner}>
								<td>
									T{row.corner}
									<span className={classes.muted}>
										{' '}
										{Math.round(row.distance)} m
									</span>
								</td>
								<td>{releaseText(row.metrics.releaseBeforeApexM)}</td>
								<td>{Math.round(row.metrics.trailShare * 100)}%</td>
								<td>{row.metrics.releaseM} m</td>
								<td
									className={classes.verdict}
									data-verdict={row.metrics.verdict}
								>
									{t(TRAIL_VERDICT_KEYS[row.metrics.verdict])}
								</td>
								<td className={classes.verdict_muted}>
									{row.fastest
										? t(
												'trail.fastestCell',
												row.fastest.lap,
												row.fastest.gainS.toFixed(2),
												releaseText(row.fastest.metrics.releaseBeforeApexM),
												Math.round(row.fastest.metrics.trailShare * 100),
											)
										: t('trail.bestHere')}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Panel>
	);
};

export default TrailBraking;
