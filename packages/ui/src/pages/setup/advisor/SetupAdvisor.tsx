import React, { FC, useMemo } from 'react';

import Button from '~@ui/Button/Button';
import Panel from '~@ui/Panel/Panel';
import CarProfileToggle from 'src/modules/carProfile/CarProfileToggle';
import SetupAdviceList from '../common/SetupAdviceList';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta, useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { useCarProfile } from 'src/modules/carProfile/carProfile';
import { useActiveSetup } from 'src/modules/carSetup/setupSheets';
import { useWeather } from 'src/modules/weather/manualWeather';
import useSetupEvidence from 'src/modules/carSetup/useSetupEvidence';
import {
	adviseSetup,
	balanceState,
	CORNER_PHASES,
	MIN_SAMPLES,
	understeerGradient,
} from '~@engines/racingMath/setupAdvisorModel';

import { NEUTRAL_GRADIENT_DEG } from '../common/setupConstants';

import classes from '../common/setup.module.scss';

const SetupAdvisor: FC = () => {
	const t = useTranslation();
	const store = useTelemetryStore();
	const { session } = useTelemetryMeta();
	const evidence = useSetupEvidence();
	const setup = useActiveSetup();
	const profile = useCarProfile();
	const weather = useWeather();

	const advice = useMemo(
		() =>
			adviseSetup(evidence, setup?.values ?? null, {
				tyreWindowC: profile.tyreWindowC,
				trackTempC: weather.trackTempC,
				wheelbaseM: profile.wheelbaseM,
			}),
		[evidence, setup, profile, weather.trackTempC],
	);
	const gradient = useMemo(
		() => understeerGradient(evidence.steering, profile.wheelbaseM),
		[evidence, profile.wheelbaseM],
	);
	const formatGradient = (value: number | null | undefined) =>
		value === null || value === undefined
			? '—'
			: `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}°/G`;
	// Mild understeer is how most cars are set up; colour only what stands out.
	const gradientState = (value: number | null | undefined) => {
		if (value === null || value === undefined) return 'unknown';
		if (Math.abs(value) < NEUTRAL_GRADIENT_DEG) return 'neutral';
		return value > 0 ? 'understeer' : 'oversteer';
	};
	const gradientCells: { key: string; value: number | null | undefined }[] = [
		{ key: 'all', value: gradient?.degPerG },
		{ key: 'slow', value: gradient?.slowDegPerG },
		{ key: 'fast', value: gradient?.fastDegPerG },
	];

	const capabilities = session?.capabilities;
	const cornerSamples = CORNER_PHASES.reduce(
		(sum, phase) => sum + evidence.balance[phase].samples,
		0,
	);
	const hasBalance = evidence.calibrationSamples >= MIN_SAMPLES.calibration;
	const missing = [
		...(capabilities && !capabilities.hasSteering ? [t('setup.missing.steering')] : []),
		...(capabilities && !capabilities.hasWheelSpeeds ? [t('setup.missing.wheels')] : []),
		...(capabilities && !capabilities.hasSuspension ? [t('setup.missing.suspension')] : []),
	];

	return (
		<div className={classes.setup_page}>
			<div className={classes.columns}>
				<div className={classes.stack}>
					<Panel
						title={t('setup.balanceTitle')}
						subtitle={t('setup.balanceHint')}
					>
						<div className={classes.phases}>
							{CORNER_PHASES.map(phase => {
								const balance = evidence.balance[phase];
								const state = balanceState(balance);
								return (
									<div
										key={phase}
										className={classes.phase}
										data-balance={state}
									>
										<span className={classes.phase_label}>
											{t(`setup.phase.${phase}` as TTranslationKey)}
										</span>
										<strong className={classes.phase_value}>
											{state === 'unknown' || balance.ratio === null
												? '—'
												: `${Math.round(balance.ratio * 100)}%`}
										</strong>
										<span className={classes.muted}>
											{t(`setup.balance.${state}` as TTranslationKey)}
										</span>
									</div>
								);
							})}
						</div>
					</Panel>

					<Panel
						title={t('setup.gradientTitle')}
						subtitle={t('setup.gradientHint', profile.wheelbaseM)}
					>
						<div className={classes.phases}>
							{gradientCells.map(cell => (
								<div
									key={cell.key}
									className={classes.phase}
									data-balance={gradientState(cell.value)}
								>
									<span className={classes.phase_label}>
										{t(`setup.gradient.${cell.key}` as TTranslationKey)}
									</span>
									<strong className={classes.phase_value}>
										{formatGradient(cell.value)}
									</strong>
								</div>
							))}
						</div>
						<p className={classes.muted}>
							{!gradient
								? t('setup.gradientNeedData')
								: gradient.characteristicKmh !== null
									? t(
											'setup.gradientCharacteristic',
											Math.round(gradient.characteristicKmh),
										)
									: gradient.criticalKmh !== null
										? t(
												'setup.gradientCritical',
												Math.round(gradient.criticalKmh),
											)
										: t('setup.gradientNeutral')}
						</p>
					</Panel>

					<Panel
						title={t('setup.adviceTitle')}
						subtitle={
							setup ? t('setup.adviceFor', setup.name) : t('setup.adviceWithoutSheet')
						}
						actions={<CarProfileToggle />}
					>
						{advice.length === 0 ? (
							<p className={classes.empty_text}>
								{cornerSamples < MIN_SAMPLES.phase || !hasBalance
									? t('setup.needData')
									: t('setup.allGood')}
							</p>
						) : (
							<SetupAdviceList advice={advice} />
						)}
					</Panel>
				</div>

				<div className={classes.stack}>
					<Panel title={t('setup.dataTitle')}>
						<p className={classes.text}>
							{t(
								'setup.dataSummary',
								cornerSamples,
								evidence.braking.samples,
								evidence.traction.samples,
							)}
						</p>
						<p className={classes.muted}>
							{hasBalance
								? t('setup.calibrated')
								: t('setup.calibrating', evidence.calibrationSamples)}
						</p>
						{missing.length > 0 && (
							<p className={classes.muted}>
								{t('setup.missingData', missing.join(', '))}
							</p>
						)}
						<Button
							variant="secondary"
							onClick={() => store.setupEvidence.reset()}
						>
							{t('setup.reset')}
						</Button>
						<p className={classes.muted}>{t('setup.resetHint')}</p>
					</Panel>
					<Panel title={t('setup.howTitle')}>
						<p className={classes.muted}>{t('setup.howText')}</p>
					</Panel>
				</div>
			</div>
		</div>
	);
};

export default SetupAdvisor;
