import React, { FC } from 'react';

import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { useLatestFrame, useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { slipRatio, slipState, temperatureState } from './carHealthFunctions';

import {
	BRAKE_WINDOW_C,
	CAR_HEALTH_HZ,
	OIL_WINDOW_C,
	SLIP_COLOR_STATE,
	SLIP_LABEL,
	TYRE_WINDOW_C,
	WATER_WINDOW_C,
	WHEELS,
} from './carHealthConstants';

import classes from './carHealth.module.scss';

const CarHealth: FC = () => {
	const t = useTranslation();
	const { session } = useTelemetryMeta();
	const frame = useLatestFrame(CAR_HEALTH_HZ);

	const capabilities = session?.capabilities;
	const hasChassis = Boolean(capabilities?.hasWheelSpeeds || capabilities?.hasSuspension);
	const engineTemps = [
		{ key: 'water', value: frame?.waterTemp ?? null, window: WATER_WINDOW_C },
		{ key: 'oil', value: frame?.oilTemp ?? null, window: OIL_WINDOW_C },
	] as const;

	return (
		<div className={classes.car_health}>
			<Panel
				title={t('car.tyres')}
				subtitle={
					capabilities && !capabilities.hasTyreZones
						? t('car.zonesUnavailable')
						: undefined
				}
			>
				{!capabilities?.hasTyreTemps ? (
					<p className={classes.empty_text}>{t('common.notAvailable')}</p>
				) : (
					<div className={classes.car_layout}>
						{WHEELS.map((wheel, index) => {
							const zones = frame?.tyreZones?.[index];
							const average = frame?.tyreTemps?.[index] ?? null;
							const cells = zones
								? [
										{ key: 'inner', value: zones.inner },
										{ key: 'middle', value: zones.middle },
										{ key: 'outer', value: zones.outer },
									]
								: [{ key: 'middle', value: average ?? 0 }];
							// Outer edge faces away from the car: left wheels show outer on the left.
							const ordered = index % 2 === 0 ? [...cells].reverse() : cells;
							return (
								<div
									key={wheel}
									className={classes.tyre}
								>
									<span className={classes.wheel_label}>{t(`car.${wheel}`)}</span>
									<div className={classes.tread}>
										{ordered.map(cell => (
											<div
												key={cell.key}
												className={classes.tread_zone}
												data-temp-state={
													average === null
														? undefined
														: temperatureState(
																Math.round(cell.value),
																TYRE_WINDOW_C,
															)
												}
												title={`${cell.key}: ${cell.value.toFixed(1)} °C`}
											>
												{average === null ? '—' : Math.round(cell.value)}
											</div>
										))}
									</div>
									{frame?.tyreWear && (
										<span className={classes.tyre_wear}>
											{t('car.wear')}{' '}
											{Math.round(frame.tyreWear[index] * 100)}%
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}
				<p className={classes.legend}>
					<span data-temp-state="cold">{t('car.cold')}</span>
					<span data-temp-state="optimal">
						{t('car.optimal')} {TYRE_WINDOW_C.min}–{TYRE_WINDOW_C.max} °C
					</span>
					<span data-temp-state="hot">{t('car.hot')}</span>
				</p>
			</Panel>
			<Panel title={t('car.brakes')}>
				{!capabilities?.hasBrakeTemps ? (
					<p className={classes.empty_text}>{t('common.notAvailable')}</p>
				) : (
					<div className={classes.brakes}>
						{WHEELS.map((wheel, index) => {
							const value = frame?.brakeTemps?.[index] ?? null;
							return (
								<div
									key={wheel}
									className={classes.brake}
									data-temp-state={
										value === null
											? undefined
											: temperatureState(Math.round(value), BRAKE_WINDOW_C)
									}
								>
									<span className={classes.wheel_label}>{t(`car.${wheel}`)}</span>
									<span className={classes.big_value}>
										{value === null ? '—' : Math.round(value)} °C
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
			<Panel title={t('car.fuel')}>
				{!capabilities?.hasFuel ? (
					<p className={classes.empty_text}>{t('common.notAvailable')}</p>
				) : (
					<span className={classes.big_value}>
						{frame?.fuel != null ? frame.fuel.toFixed(1) : '—'} L
					</span>
				)}
			</Panel>
			<Panel
				title={t('car.chassis')}
				subtitle={hasChassis ? t('car.chassisHint') : undefined}
			>
				{!hasChassis ? (
					<p className={classes.empty_text}>{t('common.notAvailable')}</p>
				) : (
					<div className={classes.brakes}>
						{WHEELS.map((wheel, index) => {
							const wheelKmh = frame?.wheelSpeeds?.[index] ?? null;
							const ratio =
								wheelKmh === null || !frame
									? null
									: slipRatio(wheelKmh, frame.speed);
							const state = slipState(ratio);
							const height = frame?.suspension?.[index] ?? null;
							return (
								<div
									key={wheel}
									className={classes.brake}
									data-slip-state={state}
									data-temp-state={
										wheelKmh === null ? undefined : SLIP_COLOR_STATE[state]
									}
								>
									<span className={classes.wheel_label}>
										{t(`car.${wheel}`)} · {t(SLIP_LABEL[state])}
									</span>
									<span className={classes.big_value}>
										{ratio === null ? '—' : `${Math.round(ratio * 100)}%`}
									</span>
									<span className={classes.tyre_wear}>
										{t('car.rideHeight')}{' '}
										{height === null ? '—' : `${Math.round(height * 1000)} mm`}
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
			<Panel title={t('car.engine')}>
				{!capabilities?.hasEngineTemps ? (
					<p className={classes.empty_text}>{t('common.notAvailable')}</p>
				) : (
					<div className={classes.brakes}>
						{engineTemps.map(item => (
							<div
								key={item.key}
								className={classes.brake}
								data-temp-state={
									item.value === null
										? undefined
										: temperatureState(Math.round(item.value), item.window)
								}
							>
								<span className={classes.wheel_label}>{t(`car.${item.key}`)}</span>
								<span className={classes.big_value}>
									{item.value === null ? '—' : Math.round(item.value)} °C
								</span>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
};

export default CarHealth;
