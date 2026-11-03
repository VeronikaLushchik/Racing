import React, { FC, useMemo } from 'react';

import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { formatDelta, formatLapTime } from 'src/services/functions';
import {
	useLatestFrame,
	useTelemetryMeta,
	useTelemetryValue,
} from 'src/modules/telemetry/useTelemetry';
import { classifyLaps, formatGap, formatSector } from './timingFunctions';

import classes from './timing.module.scss';

const TIMING_HZ = 10;

const Timing: FC = () => {
	const t = useTranslation();
	const { laps, field, bestLapMs, session } = useTelemetryMeta();
	const frame = useLatestFrame(TIMING_HZ);
	const delta = useTelemetryValue(store => store.currentDelta(), TIMING_HZ);

	const classified = useMemo(() => classifyLaps(laps).reverse(), [laps]);
	const sectorCount = Math.max(0, ...laps.map(l => l.sectorsMs.length));
	const lastLap = laps[laps.length - 1];
	const hasOpponents = session?.capabilities.hasOpponents ?? false;

	return (
		<div className={classes.timing}>
			<div className={classes.summary}>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('timing.currentLap')}</span>
					<strong className={classes.stat_value}>
						{formatLapTime(frame?.lapTimeMs)}
					</strong>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('timing.delta')}</span>
					<strong
						className={classes.stat_value}
						data-delta={delta === null ? undefined : delta <= 0 ? 'faster' : 'slower'}
					>
						{formatDelta(delta)}
					</strong>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('timing.lastLap')}</span>
					<strong className={classes.stat_value}>
						{formatLapTime(lastLap?.lapTimeMs)}
					</strong>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('timing.bestLap')}</span>
					<strong
						className={classes.stat_value}
						data-split="purple"
					>
						{formatLapTime(bestLapMs)}
					</strong>
				</div>
			</div>

			<Panel
				title={t('timing.lapTable')}
				subtitle={t('timing.sectorLegend')}
			>
				{classified.length === 0 ? (
					<p className={classes.empty_text}>{t('timing.noLaps')}</p>
				) : (
					<div className={classes.table_wrap}>
						<table className={classes.table}>
							<thead>
								<tr>
									<th>{t('common.lap')}</th>
									<th>{t('timing.lastLap')}</th>
									{Array.from({ length: sectorCount }, (_, i) => (
										<th key={i}>S{i + 1}</th>
									))}
									<th>{t('timing.compound')}</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{classified.map(({ lap, lapState, sectorStates }) => (
									<tr key={lap.lap}>
										<td>{lap.lap}</td>
										<td data-split={lapState ?? undefined}>
											{formatLapTime(lap.lapTimeMs)}
										</td>
										{Array.from({ length: sectorCount }, (_, i) => (
											<td
												key={i}
												data-split={sectorStates[i] ?? undefined}
											>
												{formatSector(lap.sectorsMs[i])}
											</td>
										))}
										<td>{lap.compound ?? '—'}</td>
										<td className={classes.lap_flags}>
											{lap.isPitLap
												? t('timing.pit')
												: !lap.isValid
													? t('timing.invalid')
													: ''}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Panel>

			<Panel title={t('timing.field')}>
				{!hasOpponents || field.length === 0 ? (
					<p className={classes.empty_text}>{t('timing.noField')}</p>
				) : (
					<div className={classes.table_wrap}>
						<table className={classes.table}>
							<thead>
								<tr>
									<th>{t('timing.position')}</th>
									<th>{t('timing.driver')}</th>
									<th>{t('timing.gap')}</th>
									<th>{t('timing.interval')}</th>
									<th>{t('timing.compound')}</th>
									<th>{t('timing.tyreAge')}</th>
								</tr>
							</thead>
							<tbody>
								{field.map(entry => (
									<tr
										key={entry.id}
										data-is-player={entry.isPlayer}
									>
										<td>{entry.position}</td>
										<td>{entry.name}</td>
										<td>{formatGap(entry.gapToLeaderS)}</td>
										<td>{formatGap(entry.intervalS)}</td>
										<td>{entry.compound ?? '—'}</td>
										<td>{entry.tyreAgeLaps ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Panel>
		</div>
	);
};

export default Timing;
