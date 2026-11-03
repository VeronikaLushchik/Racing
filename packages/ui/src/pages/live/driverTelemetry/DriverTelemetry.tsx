/** @format */

import React, { FC, useMemo, useState } from 'react';

import CanvasTrace from 'src/modules/canvasChart/CanvasTrace';
import Button from '~@ui/Button/Button';
import Panel from '~@ui/Panel/Panel';
import GGDiagram from './GGDiagram';
import LiveReadout from './LiveReadout';
import PedalBars from './PedalBars';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';

import { DEFAULT_TRACE_WINDOW_S, TRACE_WINDOWS_S } from './driverTelemetryConstants';

import { TTraceLane } from 'src/modules/canvasChart/canvasChartTypings';

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
				series: [{ channel: 'speed', colorVar: '--color-speed' }],
			},
			{
				id: 'pedals',
				label: t('driver.pedals'),
				min: 0,
				max: 1,
				weight: 2,
				series: [
					{ channel: 'throttle', colorVar: '--color-throttle' },
					{ channel: 'brake', colorVar: '--color-brake' },
				],
				format: value => `${Math.round(value * 100)}%`,
			},
			{
				id: 'gear',
				label: t('driver.gear'),
				min: 0,
				max: 8,
				weight: 1.2,
				series: [{ channel: 'gear', colorVar: '--color-gear', isStep: true }],
			},
			{
				id: 'rpm',
				label: t('driver.rpm'),
				min: 0,
				max: 13000,
				weight: 1.5,
				series: [{ channel: 'rpm', colorVar: '--color-rpm' }],
			},
		],
		[t],
	);

	const windowActions = TRACE_WINDOWS_S.map(seconds => (
		<Button
			key={seconds}
			size="sm"
			isActive={seconds === windowSeconds}
			onClick={() => setWindowSeconds(seconds)}
		>
			{seconds} s
		</Button>
	));

	const isGDerived = session ? !session.capabilities.hasMeasuredG : false;

	return (
		<div className={classes.root}>
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
			<div className={classes.side}>
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
