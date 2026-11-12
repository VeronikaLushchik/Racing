import React, { FC, useCallback, useMemo, useState } from 'react';

import Panel from '~@ui/Panel/Panel';
import LapSelect from '../common/LapSelect';
import CornerTable from './CornerTable';
import LapCompareChart from './LapCompareChart';
import MiniTrackMap, { TMapCursor } from 'src/modules/trackLibrary/MiniTrackMap';

import useTranslation from '~@engines/translations/useTranslation';
import { buildDeltaSeries, compareLaps } from '~@engines/racingMath/ghostLapModel';
import { valueAtDistance } from '~@engines/racingMath/distanceResampling';
import { formatDelta, formatLapTime } from 'src/services/functions';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { findBestRecord, pickDefaultLaps, resolveRecord } from '../common/analysisFunctions';

import { TCompareLane } from './ghostLapFunctions';

import classes from './ghostLap.module.scss';

const percent = (value: number): string => `${Math.round(value * 100)}%`;

const GhostLap: FC = () => {
	const t = useTranslation();
	const { lapRecords } = useTelemetryMeta();

	const [referenceLap, setReferenceLap] = useState<number | null>(null);
	const [compareLap, setCompareLap] = useState<number | null>(null);
	const [cursor, setCursor] = useState<TMapCursor | null>(null);

	const defaults = useMemo(() => pickDefaultLaps(lapRecords), [lapRecords]);
	const bestLap = useMemo(() => findBestRecord(lapRecords)?.lap ?? null, [lapRecords]);
	const reference = resolveRecord(lapRecords, referenceLap, defaults.reference);
	const compare = resolveRecord(lapRecords, compareLap, defaults.compare);

	const delta = useMemo(
		() => (reference && compare ? buildDeltaSeries(reference, compare) : null),
		[reference, compare],
	);
	const comparisons = useMemo(
		() => (reference && compare ? compareLaps(reference, compare) : []),
		[reference, compare],
	);
	const corners = useMemo(() => comparisons.map(item => item.corner), [comparisons]);

	const handleCursor = useCallback(
		(distance: number | null) => {
			if (distance === null || !compare) {
				setCursor(null);
				return;
			}
			setCursor({
				x: valueAtDistance(compare.channels.x, compare.step, distance),
				z: valueAtDistance(compare.channels.z, compare.step, distance),
				lapDistance: distance,
			});
		},
		[compare],
	);

	const lanes = useMemo<TCompareLane[]>(
		() => [
			{
				id: 'speed',
				label: t('driver.speed'),
				min: 0,
				weight: 3,
				colorVar: '--chart-speed',
				format: value => `${value.toFixed(0)}`,
			},
			{
				id: 'throttle',
				label: t('driver.throttle'),
				min: 0,
				max: 1,
				weight: 1.3,
				colorVar: '--chart-throttle',
				format: percent,
			},
			{
				id: 'brake',
				label: t('driver.brake'),
				min: 0,
				max: 1,
				weight: 1.3,
				colorVar: '--chart-brake',
				format: percent,
			},
			{
				id: 'gear',
				label: t('driver.gear'),
				min: 0,
				max: 8,
				weight: 1,
				colorVar: '--chart-gear',
				isStep: true,
				format: value => value.toFixed(0),
			},
			{
				id: 'delta',
				label: t('ghost.delta'),
				weight: 1.8,
				colorVar: '--chart-delta',
				format: value => `${formatDelta(value)} s`,
			},
		],
		[t],
	);

	if (lapRecords.length < 2 || !reference || !compare || !delta) {
		return (
			<Panel title={t('ghost.title')}>
				<p className={classes.empty_text}>{t('ghost.needLaps')}</p>
				<p className={classes.empty_hint}>{t('analysis.recordingHint')}</p>
			</Panel>
		);
	}

	const referenceLabel = t('analysis.lapShort', reference.lap);
	const compareLabel = t('analysis.lapShort', compare.lap);
	const totalDelta = (compare.lapTimeMs - reference.lapTimeMs) / 1000;

	return (
		<div className={classes.ghost_lap}>
			<div className={classes.toolbar}>
				<LapSelect
					label={t('ghost.reference')}
					records={lapRecords}
					value={reference.lap}
					bestLap={bestLap}
					onSet={setReferenceLap}
				/>
				<LapSelect
					label={t('ghost.compare')}
					records={lapRecords}
					value={compare.lap}
					bestLap={bestLap}
					onSet={setCompareLap}
				/>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{referenceLabel}</span>
					<strong
						className={classes.stat_value}
						data-role="reference"
					>
						{formatLapTime(reference.lapTimeMs)}
					</strong>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{compareLabel}</span>
					<strong className={classes.stat_value}>
						{formatLapTime(compare.lapTimeMs)}
					</strong>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('ghost.gap')}</span>
					<strong
						className={classes.stat_value}
						data-delta={totalDelta <= 0 ? 'faster' : 'slower'}
					>
						{formatDelta(totalDelta)}
					</strong>
				</div>
			</div>

			<div className={classes.overlay_row}>
				<Panel
					title={t('ghost.overlay')}
					subtitle={`${t('ghost.overlayHint', referenceLabel, compareLabel)} ${t('chart.zoomHint')}`}
					className={classes.overlay}
				>
					<LapCompareChart
						lanes={lanes}
						reference={reference}
						compare={compare}
						referenceLabel={referenceLabel}
						compareLabel={compareLabel}
						delta={delta}
						corners={corners}
						ariaLabel={t('ghost.overlay')}
						onCursor={handleCursor}
					/>
				</Panel>
				<Panel title={t('miniMap.title')}>
					<MiniTrackMap cursor={cursor} />
				</Panel>
			</div>

			<Panel
				title={t('ghost.corners')}
				subtitle={t('ghost.cornersHint', compareLabel, referenceLabel)}
			>
				{comparisons.length === 0 ? (
					<p className={classes.empty_text}>{t('ghost.noCorners')}</p>
				) : (
					<CornerTable comparisons={comparisons} />
				)}
			</Panel>
		</div>
	);
};

export default GhostLap;
