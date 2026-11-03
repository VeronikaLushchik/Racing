import React, { FC, useEffect, useMemo, useRef, useState } from 'react';

import Button from '~@ui/Button/Button';
import Field from '~@ui/Field/Field';

import echarts from 'src/modules/chart/echartsCore';
import useTranslation from '~@engines/translations/useTranslation';
import { useTheme } from '~@ui/common/themeContext';
import { alignToOutline, findOutlineAt } from '~@engines/racingMath/trackOutlineModel';
import { safeStorage } from 'src/services/functions';
import { useTelemetryMeta, useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { buildMiniMapOption } from './miniTrackMapFunctions';
import { trackLibrary, useTrackLibrary } from './trackLibrary';

import { TAlignedPoint } from '~@engines/racingMath/trackOutlineModel';

import classes from './miniTrackMap.module.scss';

const AUTO = 'auto';
const CHOICE_STORAGE_KEY = 'racing.trackChoice';
const CAR_HZ = 10;

export interface TMapCursor {
	x: number;
	z: number;
	lapDistance: number;
}

interface MiniTrackMapProps {
	/** Point under the chart cursor, drawn as a ring; null when the cursor is off the chart. */
	cursor: TMapCursor | null;
	className?: string;
}

/**
 * Small map of a saved track with the live car and the chart cursor. The driver picks the track
 * (or leaves it on auto, which finds the saved track the car is on) and every point is aligned
 * to it by coordinates, or by lap distance when the coordinates do not fit.
 */
const MiniTrackMap: FC<MiniTrackMapProps> = props => {
	const { cursor, className } = props;

	const t = useTranslation();
	const theme = useTheme();
	const store = useTelemetryStore();
	const { session } = useTelemetryMeta();
	const outlines = useTrackLibrary();

	const [choice, setChoice] = useState<string>(() => safeStorage.get(CHOICE_STORAGE_KEY) ?? AUTO);
	const [autoId, setAutoId] = useState<string | null>(null);
	const [carMode, setCarMode] = useState<TAlignedPoint['mode'] | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

	const outline = useMemo(() => {
		const id = choice === AUTO ? autoId : choice;
		return outlines.find(item => item.id === id) ?? null;
	}, [choice, autoId, outlines]);

	const sourceLength = session?.trackLength ?? null;

	const handleChoice = (value: string) => {
		setChoice(value);
		safeStorage.set(CHOICE_STORAGE_KEY, value);
	};

	// Auto: look for the saved track under the car once a second.
	useEffect(() => {
		if (choice !== AUTO) {
			return undefined;
		}
		const find = () => {
			const frame = store.latestFrame;
			if (!frame) {
				return;
			}
			const found = findOutlineAt(trackLibrary.getAll(), frame.x, frame.z);
			if (found) {
				setAutoId(found.id);
			}
		};
		find();
		const timer = window.setInterval(find, 1000);
		return () => window.clearInterval(timer);
	}, [choice, store, outlines]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !outline) {
			return undefined;
		}
		const chart = echarts.init(container, undefined, { renderer: 'canvas' });
		chartRef.current = chart;
		const draw = () =>
			chart.setOption(
				buildMiniMapOption(outline, theme, container.clientWidth, container.clientHeight),
			);
		draw();
		const observer = new ResizeObserver(() => {
			chart.resize();
			draw();
		});
		observer.observe(container);

		let lastVersion = -1;
		const timer = window.setInterval(() => {
			const frame = store.latestFrame;
			if (!frame || store.frameVersion === lastVersion) {
				return;
			}
			lastVersion = store.frameVersion;
			const point = alignToOutline(outline, frame, sourceLength);
			setCarMode(point.mode);
			chart.setOption(
				{ series: [{ id: 'car', data: [[point.x, point.z]] }] },
				{ lazyUpdate: true },
			);
		}, 1000 / CAR_HZ);

		return () => {
			window.clearInterval(timer);
			observer.disconnect();
			chart.dispose();
			chartRef.current = null;
		};
	}, [outline, theme, store, sourceLength]);

	useEffect(() => {
		const point = cursor && outline ? alignToOutline(outline, cursor, sourceLength) : null;
		chartRef.current?.setOption({
			series: [{ id: 'cursor', data: point ? [[point.x, point.z]] : [] }],
		});
	}, [cursor, outline, sourceLength]);

	const hint = !outline
		? outlines.length === 0
			? t('miniMap.noTracks')
			: t('miniMap.notFound')
		: carMode === 'distance'
			? t('miniMap.byDistance')
			: t('miniMap.hint');

	return (
		<div className={className}>
			<div className={classes.mini_track_map}>
				<Field label={t('miniMap.track')}>
					<select
						value={choice}
						onChange={event => handleChoice(event.target.value)}
					>
						<option value={AUTO}>
							{choice === AUTO && outline
								? t('miniMap.autoFound', outline.name)
								: t('miniMap.auto')}
						</option>
						{outlines.map(item => (
							<option
								key={item.id}
								value={item.id}
							>
								{item.name}
							</option>
						))}
					</select>
				</Field>
				{outline ? (
					<div
						ref={containerRef}
						className={classes.map}
						role="img"
						aria-label={t('miniMap.title')}
					/>
				) : (
					<div className={classes.placeholder} />
				)}
				<p
					className={classes.hint}
					data-is-warning={carMode === 'distance' && !!outline}
				>
					{hint}
				</p>
				{outline && (
					<div className={classes.manage}>
						<Field label={t('miniMap.name')}>
							<input
								key={outline.id}
								defaultValue={outline.name}
								onBlur={event =>
									trackLibrary.rename(outline.id, event.target.value)
								}
								onKeyDown={event => {
									if (event.key === 'Enter') event.currentTarget.blur();
								}}
							/>
						</Field>
						<Button
							variant="text"
							size="sm"
							onClick={() => {
								trackLibrary.remove(outline.id);
								handleChoice(AUTO);
								setAutoId(null);
							}}
						>
							{t('miniMap.forget')}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
};

export default MiniTrackMap;
