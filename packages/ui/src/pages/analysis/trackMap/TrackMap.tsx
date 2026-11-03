import React, { FC, useMemo, useState } from 'react';

import Panel from '~@ui/Panel/Panel';
import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';
import LapSelect from '../common/LapSelect';
import TrackMapChart from './TrackMapChart';

import useTranslation from '~@engines/translations/useTranslation';
import { useTheme } from '~@ui/common/themeContext';
import { buildDeltaSeries, findCorners } from '~@engines/racingMath/ghostLapModel';
import { sectorMarks } from '~@engines/racingMath/trackMapModel';
import { formatLapTime } from 'src/services/functions';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { findBestRecord, resolveRecord } from '../common/analysisFunctions';
import { trackChannelValues, trackColorScale } from './trackMapFunctions';

import { TRACK_CHANNEL_KEYS, TRACK_CHANNELS, TTrackChannel } from './trackMapConstants';

import { TOption } from 'src/typings';

import classes from './trackMap.module.scss';

const TrackMap: FC = () => {
	const t = useTranslation();
	const theme = useTheme();
	const { lapRecords } = useTelemetryMeta();

	const [chosenLap, setChosenLap] = useState<number | null>(null);
	const [channel, setChannel] = useState<TTrackChannel>('speed');

	const best = useMemo(() => findBestRecord(lapRecords), [lapRecords]);
	const lap = resolveRecord(lapRecords, chosenLap, best?.lap ?? null);
	const isBestShown = !!lap && lap.lap === best?.lap;
	const activeChannel: TTrackChannel = channel === 'delta' && isBestShown ? 'speed' : channel;

	const delta = useMemo(
		() => (lap && best && !isBestShown ? buildDeltaSeries(best, lap) : null),
		[lap, best, isBestShown],
	);
	const values = useMemo(
		() => (lap ? trackChannelValues(lap, activeChannel, delta) : null),
		[lap, activeChannel, delta],
	);
	const scale = useMemo(
		() => (values ? trackColorScale(activeChannel, values, theme) : null),
		[activeChannel, values, theme],
	);
	const corners = useMemo(() => (lap ? findCorners(lap.channels.speed, lap.step) : []), [lap]);
	const sectors = useMemo(() => (lap ? sectorMarks(lap) : []), [lap]);

	const channelOptions = useMemo<TOption<TTrackChannel>[]>(
		() =>
			TRACK_CHANNELS.filter(item => item !== 'delta' || !isBestShown).map(item => ({
				value: item,
				label: t(TRACK_CHANNEL_KEYS[item]),
			})),
		[t, isBestShown],
	);

	if (!lap || !values || !scale) {
		return (
			<Panel title={t('trackMap.title')}>
				<p className={classes.empty_text}>{t('trackMap.needLap')}</p>
				<p className={classes.empty_hint}>{t('analysis.recordingHint')}</p>
			</Panel>
		);
	}

	const channelToggle = (
		<SegmentedToggle
			value={activeChannel}
			options={channelOptions}
			onSet={setChannel}
			ariaLabel={t('trackMap.colourBy')}
		/>
	);

	const subtitle =
		activeChannel === 'delta' && best
			? t('trackMap.timeLostHint', best.lap)
			: t('trackMap.hint');

	return (
		<div className={classes.track_map}>
			<Panel
				title={t('trackMap.title')}
				subtitle={subtitle}
				actions={channelToggle}
				className={classes.map_panel}
			>
				<TrackMapChart
					lap={lap}
					values={values}
					scale={scale}
					corners={corners}
					sectors={sectors}
					ariaLabel={t('trackMap.title')}
				/>
			</Panel>
			<div className={classes.side_column}>
				<LapSelect
					label={t('trackMap.lap')}
					records={lapRecords}
					value={lap.lap}
					bestLap={best?.lap ?? null}
					onSet={setChosenLap}
				/>
				<Panel title={t('trackMap.corners')}>
					{corners.length === 0 ? (
						<p className={classes.empty_text}>{t('ghost.noCorners')}</p>
					) : (
						<table className={classes.table}>
							<thead>
								<tr>
									<th>{t('ghost.corner')}</th>
									<th>{t('trackMap.distance')}</th>
									<th>{t('ghost.apexSpeed')}</th>
								</tr>
							</thead>
							<tbody>
								{corners.map(corner => (
									<tr key={corner.number}>
										<td>T{corner.number}</td>
										<td>{corner.distance.toFixed(0)} m</td>
										<td>{corner.minSpeed.toFixed(0)} km/h</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</Panel>
				<p className={classes.lap_time}>
					{t('analysis.lapShort', lap.lap)} · {formatLapTime(lap.lapTimeMs)}
				</p>
				<p className={classes.empty_hint}>{t('trackMap.opponentsHint')}</p>
			</div>
		</div>
	);
};

export default TrackMap;
