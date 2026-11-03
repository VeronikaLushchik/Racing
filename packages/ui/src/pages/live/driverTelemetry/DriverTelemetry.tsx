import React, { FC, useCallback, useMemo, useState } from 'react';

import TraceChart from 'src/modules/chart/TraceChart';
import MiniTrackMap, { TMapCursor } from 'src/modules/trackLibrary/MiniTrackMap';
import Panel from '~@ui/Panel/Panel';
import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';
import GGDiagram from './GGDiagram';
import LiveReadout from './LiveReadout';
import PedalBars from './PedalBars';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta, useTelemetryStore } from 'src/modules/telemetry/useTelemetry';

import { DEFAULT_TRACE_WINDOW_S, TRACE_WINDOWS_S } from './driverTelemetryConstants';

import { TTraceLane } from 'src/modules/chart/chartTypings';
import { TOption } from 'src/typings';

import classes from './driverTelemetry.module.scss';

const DriverTelemetry: FC = () => {
	const t = useTranslation();
	const { session } = useTelemetryMeta();
	const store = useTelemetryStore();

	const [windowSeconds, setWindowSeconds] = useState<number>(DEFAULT_TRACE_WINDOW_S);
	const [cursor, setCursor] = useState<TMapCursor | null>(null);

	// The trace axis is "seconds before now": find the sample under the cursor in the buffer.
	const handleCursor = useCallback(
		(secondsAgo: number | null) => {
			const { buffer } = store;
			const tEnd = buffer.latest('t');
			if (secondsAgo === null || tEnd === null || buffer.count === 0) {
				setCursor(null);
				return;
			}
			const index = Math.min(
				buffer.count - 1,
				buffer.firstIndexSince(tEnd + secondsAgo * 1000),
			);
			setCursor({
				x: buffer.get('x', index),
				z: buffer.get('z', index),
				lapDistance: buffer.get('lapDistance', index),
			});
		},
		[store],
	);

	const lanes = useMemo<TTraceLane[]>(
		() => [
			{
				id: 'speed',
				label: t('driver.speed'),
				min: 0,
				max: 360,
				weight: 3,
				series: [{ channel: 'speed', label: t('driver.speed'), colorVar: '--chart-speed' }],
			},
			{
				id: 'pedals',
				label: t('driver.pedals'),
				min: 0,
				max: 1,
				weight: 2,
				series: [
					{
						channel: 'throttle',
						label: t('driver.throttle'),
						colorVar: '--chart-throttle',
					},
					{ channel: 'brake', label: t('driver.brake'), colorVar: '--chart-brake' },
				],
				format: value => `${Math.round(value * 100)}%`,
			},
			{
				id: 'gear',
				label: t('driver.gear'),
				min: 0,
				max: 8,
				weight: 1.2,
				series: [
					{
						channel: 'gear',
						label: t('driver.gear'),
						colorVar: '--chart-gear',
						isStep: true,
					},
				],
			},
			{
				id: 'rpm',
				label: t('driver.rpm'),
				min: 0,
				max: 13000,
				weight: 1.5,
				series: [{ channel: 'rpm', label: t('driver.rpm'), colorVar: '--chart-rpm' }],
			},
		],
		[t],
	);

	const windowOptions = useMemo<TOption[]>(
		() => TRACE_WINDOWS_S.map(seconds => ({ value: String(seconds), label: `${seconds} s` })),
		[],
	);

	const handleWindowSet = useCallback(
		(value: string) => setWindowSeconds(Number(value)),
		[setWindowSeconds],
	);

	const windowActions = (
		<SegmentedToggle
			value={String(windowSeconds)}
			options={windowOptions}
			onSet={handleWindowSet}
			ariaLabel={t('driver.traceWindow')}
		/>
	);

	const isGDerived = session ? !session.capabilities.hasMeasuredG : false;

	return (
		<div className={classes.driver_telemetry}>
			<Panel
				title={t('driver.traces')}
				className={classes.traces}
				actions={windowActions}
			>
				<TraceChart
					lanes={lanes}
					windowSeconds={windowSeconds}
					ariaLabel={t('driver.traces')}
					onCursor={handleCursor}
				/>
			</Panel>
			<div className={classes.side_column}>
				<Panel title={t('miniMap.title')}>
					<MiniTrackMap cursor={cursor} />
				</Panel>
				<Panel title={t('driver.readout')}>
					<LiveReadout />
				</Panel>
				<Panel title={t('driver.pedals')}>
					<PedalBars />
				</Panel>
				<Panel
					title={t('driver.gg')}
					subtitle={isGDerived ? t('driver.derivedG') : t('driver.ggHint')}
				>
					<GGDiagram ariaLabel={t('driver.gg')} />
				</Panel>
			</div>
		</div>
	);
};

export default DriverTelemetry;
