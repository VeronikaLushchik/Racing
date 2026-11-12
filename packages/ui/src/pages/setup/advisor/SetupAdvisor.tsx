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
} from '~@engines/racingMath/setupAdvisorModel';

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
			}),
		[evidence, setup, profile, weather.trackTempC],
	);

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
