import React, { FC, MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';

import Button from '~@ui/Button/Button';
import Field from '~@ui/Field/Field';
import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';

import useTranslation from '~@engines/translations/useTranslation';
import { useTheme } from '~@ui/common/themeContext';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import {
	CHROMA_GREEN,
	downloadBlob,
	overlayVideoType,
	recordOverlay,
	TOverlayBackground,
	TOverlayRecording,
	videoExtension,
} from 'src/modules/chart/overlayRecorder';
import { formatLapTime } from 'src/services/functions';

import type { ECharts } from 'echarts/core';
import { TTraceLane } from 'src/modules/chart/chartTypings';
import { TOption } from 'src/typings';

import classes from './driverTelemetry.module.scss';

interface OverlayExportProps {
	lanes: TTraceLane[];
	windowSeconds: number;
	/** The live chart, for a picture of what it shows now. */
	chartRef: MutableRefObject<ECharts | null>;
}

/**
 * Saves the driver's chart to lay over an onboard video: a recorded lap as a video that
 * scrolls in real time, or a picture of the chart as it is now. The background is transparent
 * or pure green for editors that key it out.
 */
const OverlayExport: FC<OverlayExportProps> = props => {
	const { lanes, windowSeconds, chartRef } = props;

	const t = useTranslation();
	const theme = useTheme();
	const { lapRecords, session } = useTelemetryMeta();

	const [isOpen, setIsOpen] = useState(false);
	const [background, setBackground] = useState<TOverlayBackground>('transparent');
	const [lapChoice, setLapChoice] = useState<number | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const recordingRef = useRef<TOverlayRecording | null>(null);

	useEffect(() => () => recordingRef.current?.cancel(), []);

	const best = useMemo(() => {
		const valid = lapRecords.filter(record => record.isValid && !record.isPitLap);
		return valid.length
			? valid.reduce((a, b) => (b.lapTimeMs < a.lapTimeMs ? b : a)).lap
			: null;
	}, [lapRecords]);
	const lap = lapChoice ?? best ?? lapRecords[lapRecords.length - 1]?.lap ?? null;
	const record = lapRecords.find(item => item.lap === lap) ?? null;
	const videoType = useMemo(overlayVideoType, []);

	const backgroundOptions = useMemo<TOption<TOverlayBackground>[]>(
		() => [
			{ value: 'transparent', label: t('overlay.transparent') },
			{ value: 'green', label: t('overlay.green') },
		],
		[t],
	);

	const fileName = (suffix: string) =>
		`${(session?.track ?? session?.title ?? 'lap').replace(/[^\w-]+/g, '_')}_${suffix}`;

	const handleRecord = async () => {
		if (!record) return;
		const recording = recordOverlay({
			lanes,
			record,
			windowSeconds,
			theme,
			background,
			onProgress: setProgress,
		});
		recordingRef.current = recording;
		setProgress(0);
		const blob = await recording.done;
		recordingRef.current = null;
		setProgress(null);
		if (blob) downloadBlob(blob, fileName(`lap${record.lap}.${videoExtension(blob)}`));
	};

	const handlePicture = () => {
		const chart = chartRef.current;
		if (!chart) return;
		const url = chart.getDataURL({
			type: 'png',
			pixelRatio: 2,
			backgroundColor: background === 'green' ? CHROMA_GREEN : 'transparent',
		});
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName('chart.png');
		link.click();
	};

	const isRecording = progress !== null;

	return (
		<div className={classes.overlay_export}>
			<Button
				variant="secondary"
				size="sm"
				onClick={() => setIsOpen(open => !open)}
				aria-expanded={isOpen}
			>
				{t('overlay.open')}
			</Button>
			{isOpen && (
				<div
					className={classes.overlay_popover}
					role="dialog"
					aria-label={t('overlay.title')}
				>
					<p className={classes.overlay_title}>{t('overlay.title')}</p>
					<Field label={t('overlay.lap')}>
						<select
							value={lap ?? ''}
							disabled={isRecording || lapRecords.length === 0}
							onChange={event => setLapChoice(Number(event.target.value))}
						>
							{lapRecords.length === 0 && (
								<option value="">{t('overlay.noLaps')}</option>
							)}
							{lapRecords.map(item => (
								<option
									key={item.lap}
									value={item.lap}
								>
									{t(
										'overlay.lapOption',
										item.lap,
										formatLapTime(item.lapTimeMs),
									)}
									{item.lap === best ? ` · ${t('overlay.best')}` : ''}
								</option>
							))}
						</select>
					</Field>
					<SegmentedToggle
						value={background}
						options={backgroundOptions}
						onSet={setBackground}
						disabled={isRecording}
						ariaLabel={t('overlay.background')}
					/>
					<div className={classes.overlay_buttons}>
						{isRecording ? (
							<>
								<span className={classes.overlay_progress}>
									{t('overlay.recording', Math.round((progress ?? 0) * 100))}
								</span>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => recordingRef.current?.cancel()}
								>
									{t('overlay.cancel')}
								</Button>
							</>
						) : (
							<>
								<Button
									size="sm"
									disabled={!record || !videoType}
									onClick={handleRecord}
								>
									{t('overlay.recordVideo')}
								</Button>
								<Button
									variant="secondary"
									size="sm"
									onClick={handlePicture}
								>
									{t('overlay.picture')}
								</Button>
							</>
						)}
					</div>
					<p className={classes.overlay_hint}>
						{videoType
							? t(
									'overlay.hint',
									record ? formatLapTime(record.lapTimeMs) : '—',
									videoType.includes('mp4') ? 'MP4' : 'WebM',
								)
							: t('overlay.noVideo')}
					</p>
				</div>
			)}
		</div>
	);
};

export default OverlayExport;
