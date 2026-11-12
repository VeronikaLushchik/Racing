import React, { FC, useMemo } from 'react';

import Panel from '~@ui/Panel/Panel';
import LapTimesChart from './LapTimesChart';
import SetupAdviceList, { changeText } from 'src/pages/setup/common/SetupAdviceList';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import useSetupEvidence from 'src/modules/carSetup/useSetupEvidence';
import { useActiveSetup } from 'src/modules/carSetup/setupSheets';
import { useCarProfile } from 'src/modules/carProfile/carProfile';
import { useWeather } from 'src/modules/weather/manualWeather';
import { buildSessionReport, TImprovement } from '~@engines/racingMath/sessionReportModel';
import { formatDelta, formatLapTime } from 'src/services/functions';

import { INSIGHT_KEYS } from '../ghostLap/ghostLapConstants';
import { FINDING_KEYS, PEDAL_ROWS } from './sessionReportConstants';

import classes from './sessionReport.module.scss';

type TTranslate = ReturnType<typeof useTranslation>;

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number, digits = 2): string => `${value.toFixed(digits)} s`;
const sectorTime = (ms: number): string =>
	ms >= 60000 ? formatLapTime(ms) : (ms / 1000).toFixed(3);

const improvementTitle = (t: TTranslate, item: TImprovement): string => {
	switch (item.kind) {
		case 'corner':
			return t('report.improve.cornerTitle', item.corner, item.gainS.toFixed(2));
		case 'sector':
			return t('report.improve.sectorTitle', item.sector, item.gainS.toFixed(2));
		case 'consistency':
			return t('report.improve.consistencyTitle', item.gainS.toFixed(2));
		case 'setup':
		default:
			return t('report.improve.setupTitle');
	}
};

const improvementText = (t: TTranslate, item: TImprovement): string => {
	switch (item.kind) {
		case 'corner':
			return item.insight
				? t(
						'report.improve.corner',
						item.corner,
						item.fromLap,
						t(INSIGHT_KEYS[item.insight.kind], ...item.insight.args),
					)
				: t('report.improve.cornerPlain', item.corner, item.fromLap);
		case 'sector':
			return t('report.improve.sector', item.sector, item.fromLap);
		case 'consistency':
			return t('report.improve.consistency', item.gainS.toFixed(2));
		case 'setup':
		default:
			return `${t(`setup.advice.${item.advice.id}.title` as TTranslationKey)} → ${changeText(
				t,
				item.advice.changes[0],
			)}`;
	}
};

const SessionReport: FC = () => {
	const t = useTranslation();
	const { lapRecords, sessionEndedAt, session } = useTelemetryMeta();
	const evidence = useSetupEvidence();
	const setup = useActiveSetup();
	const profile = useCarProfile();
	const weather = useWeather();

	const report = useMemo(
		() =>
			buildSessionReport({
				records: lapRecords,
				evidence,
				setup: setup?.values ?? null,
				tyreWindowC: profile.tyreWindowC,
				weather,
			}),
		[lapRecords, evidence, setup, profile, weather],
	);

	if (!report) {
		return (
			<Panel title={t('report.title')}>
				<p className={classes.empty_text}>{t('report.needLap')}</p>
				<p className={classes.empty_hint}>{t('analysis.recordingHint')}</p>
			</Panel>
		);
	}

	const { summary } = report;
	const sectorCount = report.sectors.length;
	const bestLapMs = summary.bestLapMs ?? 0;
	const stats: { label: string; value: string; hint?: string; tone?: string }[] = [
		{
			label: t('report.bestLap'),
			value: formatLapTime(summary.bestLapMs),
			hint: t('analysis.lapShort', summary.bestLap ?? 0),
			tone: 'best',
		},
		{
			label: t('report.idealLap'),
			value: formatLapTime(summary.idealLapMs),
			hint:
				summary.idealLapMs !== null
					? `${formatDelta((summary.idealLapMs - bestLapMs) / 1000)} s`
					: t('report.needTwoLapsShort'),
			tone: 'ideal',
		},
		{
			label: t('report.theoreticalBest'),
			value: formatLapTime(summary.theoreticalBestMs),
			hint:
				summary.theoreticalBestMs !== null
					? `${formatDelta((summary.theoreticalBestMs - bestLapMs) / 1000)} s`
					: undefined,
		},
		{
			label: t('report.average'),
			value: formatLapTime(summary.meanCleanMs),
			hint:
				summary.meanCleanMs !== null
					? `${formatDelta((summary.meanCleanMs - bestLapMs) / 1000)} s`
					: undefined,
		},
		{
			label: t('report.spread'),
			value:
				summary.stdDevCleanMs !== null
					? `±${(summary.stdDevCleanMs / 1000).toFixed(2)}`
					: '—',
			hint: t('report.nearBest', summary.lapsNearBest),
		},
		{
			label: t('report.laps'),
			value: `${summary.cleanLapCount} / ${summary.lapCount}`,
			hint: t('report.distance', summary.distanceKm.toFixed(1)),
		},
	];

	return (
		<div className={classes.report}>
			<p
				className={classes.status}
				data-is-ended={sessionEndedAt !== null}
			>
				{sessionEndedAt !== null ? t('report.statusEnded') : t('report.statusLive')}
				{session?.title ? ` · ${session.title}` : ''}
			</p>

			<div className={classes.stats}>
				{stats.map(stat => (
					<div
						key={stat.label}
						className={classes.stat}
					>
						<span className={classes.stat_label}>{stat.label}</span>
						<strong
							className={classes.stat_value}
							data-tone={stat.tone}
						>
							{stat.value}
						</strong>
						{stat.hint && <span className={classes.stat_hint}>{stat.hint}</span>}
					</div>
				))}
			</div>

			<div className={classes.row}>
				<Panel
					title={t('report.improveTitle')}
					subtitle={t('report.improveHint')}
				>
					{report.improvements.length === 0 ? (
						<p className={classes.empty_text}>
							{summary.cleanLapCount < 2
								? t('report.needTwoLaps')
								: t('report.improveNone')}
						</p>
					) : (
						<ol className={classes.improvements}>
							{report.improvements.map((item, index) => (
								<li
									key={`${item.kind}-${index}`}
									className={classes.improvement}
									data-kind={item.kind}
								>
									<h3 className={classes.improvement_title}>
										{improvementTitle(t, item)}
									</h3>
									<p className={classes.text}>{improvementText(t, item)}</p>
								</li>
							))}
						</ol>
					)}
				</Panel>
				<Panel
					title={t('report.lapChart')}
					subtitle={t('report.lapChartHint')}
					className={classes.chart_panel}
				>
					<LapTimesChart
						report={report}
						ariaLabel={t('report.lapChart')}
					/>
				</Panel>
			</div>

			<Panel
				title={t('report.cornersTitle')}
				subtitle={t('report.cornersHint', summary.bestLap ?? 0)}
			>
				{report.corners.length === 0 ? (
					<p className={classes.empty_text}>{t('report.needTwoLaps')}</p>
				) : (
					<div className={classes.table_wrap}>
						<table className={classes.table}>
							<thead>
								<tr>
									<th>{t('ghost.corner')}</th>
									<th>{t('report.col.fastestOn')}</th>
									<th>{t('report.col.bestLapLoss')}</th>
									<th>{t('report.col.meanLoss')}</th>
									<th>{t('report.col.apex')}</th>
									<th>{t('report.col.apexSpread')}</th>
									<th>{t('report.col.brakeSpread')}</th>
								</tr>
							</thead>
							<tbody>
								{report.corners.map(corner => (
									<tr key={corner.number}>
										<td>
											<strong>T{corner.number}</strong>
											<span className={classes.muted}>
												{' '}
												{corner.distance.toFixed(0)} m
											</span>
										</td>
										<td>
											{t('analysis.lapShort', corner.bestLap)}{' '}
											<span className={classes.muted}>
												{seconds(corner.bestTimeS)}
											</span>
										</td>
										<td data-is-loss={corner.bestLapLossS >= 0.03}>
											{corner.bestLapLossS > 0.005
												? `+${seconds(corner.bestLapLossS)}`
												: '—'}
										</td>
										<td data-is-loss={corner.meanLossS >= 0.1}>
											+{seconds(corner.meanLossS)}
										</td>
										<td>
											{corner.bestApexKmh.toFixed(0)}{' '}
											<span className={classes.muted}>
												/ {corner.meanApexKmh.toFixed(0)} km/h
											</span>
										</td>
										<td data-is-loss={corner.apexSpreadKmh >= 4}>
											±{corner.apexSpreadKmh.toFixed(1)} km/h
										</td>
										<td
											data-is-loss={
												corner.brakeSpreadM !== null &&
												corner.brakeSpreadM >= 8
											}
										>
											{corner.brakeSpreadM === null
												? t('report.flat')
												: `±${corner.brakeSpreadM.toFixed(0)} m`}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Panel>

			<div className={classes.row}>
				<Panel
					title={t('report.lapsTitle')}
					subtitle={report.isSyntheticSectors ? t('report.sectorsSynthetic') : undefined}
				>
					<div className={classes.table_wrap}>
						<table className={classes.table}>
							<thead>
								<tr>
									<th>{t('common.lap')}</th>
									<th>{t('report.col.time')}</th>
									<th>{t('report.col.delta')}</th>
									{report.sectors.map((_, index) => (
										<th key={index}>S{index + 1}</th>
									))}
									<th>{t('report.col.notes')}</th>
								</tr>
							</thead>
							<tbody>
								{report.laps.map(lap => (
									<tr
										key={lap.lap}
										data-is-clean={lap.isClean}
									>
										<td>{lap.lap}</td>
										<td data-is-best={lap.isBest}>
											{formatLapTime(lap.lapTimeMs)}
										</td>
										<td>
											{lap.isBest
												? '—'
												: formatDelta(lap.deltaToBestMs / 1000)}
										</td>
										{report.sectors.map((sector, index) => (
											<td
												key={index}
												data-is-best={sector.bestLap === lap.lap}
											>
												{lap.sectorsMs[index] !== undefined
													? sectorTime(lap.sectorsMs[index])
													: '—'}
											</td>
										))}
										<td className={classes.muted}>
											{[
												lap.isBest && t('analysis.best'),
												!lap.isValid && t('timing.invalid'),
												lap.isPitLap && t('timing.pit'),
												lap.isOutlier && t('report.outlier'),
											]
												.filter(Boolean)
												.join(' · ')}
										</td>
									</tr>
								))}
							</tbody>
							{sectorCount > 0 && (
								<tfoot>
									<tr>
										<td colSpan={3}>{t('report.bestSectors')}</td>
										{report.sectors.map((sector, index) => (
											<td key={index}>
												{sectorTime(sector.bestMs)}
												<span className={classes.muted}>
													{' '}
													L{sector.bestLap}
												</span>
											</td>
										))}
										<td />
									</tr>
									<tr>
										<td colSpan={3}>{t('report.sectorSpread')}</td>
										{report.sectors.map((sector, index) => (
											<td key={index}>
												±{(sector.stdDevMs / 1000).toFixed(2)}
											</td>
										))}
										<td />
									</tr>
								</tfoot>
							)}
						</table>
					</div>
				</Panel>

				<Panel
					title={t('report.drivingTitle')}
					subtitle={t('report.drivingHint')}
				>
					{report.pedals && (
						<table className={classes.table}>
							<thead>
								<tr>
									<th />
									<th>{t('report.bestLap')}</th>
									<th>{t('report.average')}</th>
								</tr>
							</thead>
							<tbody>
								{PEDAL_ROWS.map(row => (
									<tr key={row.key}>
										<td>{t(row.tKey)}</td>
										<td>{percent(report.pedals?.best[row.key] ?? 0)}</td>
										<td>{percent(report.pedals?.mean[row.key] ?? 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
					{report.findings.length === 0 ? (
						<p className={classes.muted}>{t('report.drivingNone')}</p>
					) : (
						<ul className={classes.findings}>
							{report.findings.map(finding => (
								<li
									key={finding.id}
									className={classes.text}
								>
									{t(FINDING_KEYS[finding.id], ...finding.args)}
								</li>
							))}
						</ul>
					)}
				</Panel>
			</div>

			<div className={classes.row}>
				<Panel
					title={t('report.setupTitle')}
					subtitle={
						setup ? t('setup.adviceFor', setup.name) : t('setup.adviceWithoutSheet')
					}
				>
					{report.setupFrames === 0 ? (
						<p className={classes.empty_text}>{t('report.setupNoFrames')}</p>
					) : report.setupAdvice.length === 0 ? (
						<p className={classes.empty_text}>{t('report.setupNone')}</p>
					) : (
						<SetupAdviceList advice={report.setupAdvice} />
					)}
				</Panel>
				<Panel
					title={t('report.conditionsTitle')}
					subtitle={t(
						'report.conditions',
						weather.airTempC.toFixed(0),
						weather.trackTempC.toFixed(0),
						t(`weather.${weather.condition}` as TTranslationKey),
					)}
				>
					<ul className={classes.findings}>
						{report.weatherAdvice.map(item => (
							<li
								key={item.id}
								className={classes.text}
								data-tone={item.tone}
							>
								{t(`weather.advice.${item.id}` as TTranslationKey)}
							</li>
						))}
					</ul>
				</Panel>
			</div>
		</div>
	);
};

export default SessionReport;
