/** @format */

import React, { FC, useCallback, useMemo, useState } from 'react';

import CanvasTrace from 'src/modules/canvasChart/CanvasTrace';
import Panel from '~@ui/Panel/Panel';
import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';
import GGDiagram from './GGDiagram';
import LiveReadout from './LiveReadout';
import PedalBars from './PedalBars';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';

import { DEFAULT_TRACE_WINDOW_S, TRACE_WINDOWS_S } from './driverTelemetryConstants';

import { TTraceLane } from 'src/modules/canvasChart/canvasChartTypings';
import { TOption } from 'src/typings';

import classes from './driverTelemetry.module.scss';

const DriverTelemetry: FC = () => {
	const t = useTranslation();
	const { session } = useTelemetryMeta();

	const [windowSeconds, setWindowSeconds] = useState<number>(DEFAULT_TRACE_WINDOW_S);

	const lanes = useMemo<TTraceLane[]>(
		() => [
			{
				id: 'speed',
				label: t('driver.speed'),
				min: 0,
				max: 360,
				weight: 3,
				series: [{ channel: 'speed', colorVar: '--chart-speed' }],
			},
			{
				id: 'pedals',
				label: t('driver.pedals'),
				min: 0,
				max: 1,
				weight: 2,
				series: [
					{ channel: 'throttle', colorVar: '--chart-throttle' },
					{ channel: 'brake', colorVar: '--chart-brake' },
				],
				format: value => `${Math.round(value * 100)}%`,
			},
			{
				id: 'gear',
				label: t('driver.gear'),
				min: 0,
				max: 8,
				weight: 1.2,
				series: [{ channel: 'gear', colorVar: '--chart-gear', isStep: true }],
			},
			{
				id: 'rpm',
				label: t('driver.rpm'),
				min: 0,
				max: 13000,
				weight: 1.5,
				series: [{ channel: 'rpm', colorVar: '--chart-rpm' }],
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
				<CanvasTrace
					lanes={lanes}
					windowSeconds={windowSeconds}
					ariaLabel={t('driver.traces')}
				/>
			</Panel>
			<div className={classes.side_column}>
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
