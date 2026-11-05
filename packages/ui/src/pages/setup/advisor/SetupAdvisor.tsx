import React, { FC, useMemo, useSyncExternalStore } from 'react';

import Button from '~@ui/Button/Button';
import Panel from '~@ui/Panel/Panel';
import CarProfileToggle from 'src/modules/carProfile/CarProfileToggle';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta, useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { useCarProfile } from 'src/modules/carProfile/carProfile';
import { useActiveSetup } from 'src/modules/carSetup/setupSheets';
import { useWeather } from 'src/modules/weather/manualWeather';
import {
	adviseSetup,
	balanceState,
	CORNER_PHASES,
	MIN_SAMPLES,
	SETUP_FIELD_SPECS,
	TSetupAdvice,
	TSetupChange,
	TSetupEvidence,
} from '~@engines/racingMath/setupAdvisorModel';

import { ADVISOR_HZ, FIELD_LABEL } from '../common/setupConstants';

import classes from '../common/setup.module.scss';

type TTranslate = ReturnType<typeof useTranslation>;

/** Evidence snapshot, re-read once a second and right after a reset. */
const useSetupEvidence = (): TSetupEvidence => {
	const store = useTelemetryStore();
	const collector = store.setupEvidence;
	return useSyncExternalStore(listener => {
		let seen = collector.version;
		const id = window.setInterval(() => {
			if (collector.version !== seen) {
				seen = collector.version;
				listener();
			}
		}, 1000 / ADVISOR_HZ);
		return () => window.clearInterval(id);
	}, collector.summary);
};

const formatNumber = (value: number, step: number): string =>
	value.toFixed(Math.max(0, -Math.floor(Math.log10(step))));

const changeText = (t: TTranslate, change: TSetupChange): string => {
	const label = FIELD_LABEL[change.field];
	const spec = SETUP_FIELD_SPECS[change.field];
	const name = `${t(`setup.field.${label.row}` as TTranslationKey)}${
		label.axle ? ` (${t(`setup.${label.axle}` as TTranslationKey)})` : ''
	}`;
	const unit = spec.unit ? ` ${spec.unit}` : '';
	if (change.field === 'brakeBalance') {
		const brakes = t('setup.brakeBalanceName');
		const where = t(change.direction > 0 ? 'setup.towardRear' : 'setup.towardFront');
		return change.from !== null && change.to !== null
			? `${brakes}: ${change.from} → ${change.to} (${where})`
			: `${brakes}: ${where}`;
	}
	if (change.from !== null && change.to !== null) {
		return `${name}: ${formatNumber(change.from, spec.step)} → ${formatNumber(
			change.to,
			spec.step,
		)}${unit}`;
	}
	return `${name}: ${t(change.direction > 0 ? 'setup.raise' : 'setup.lower')} ${formatNumber(
		spec.click,
		spec.step,
	)}${unit}`;
};

const evidenceText = (t: TTranslate, advice: TSetupAdvice): string => {
	switch (advice.metric) {
		case 'ratio':
			return t(
				advice.value >= 1 ? 'setup.evidence.moreSteer' : 'setup.evidence.lessSteer',
				Math.round(Math.abs(advice.value - 1) * 100),
			);
		case 'counterSteer':
			return t('setup.evidence.counterSteer', Math.round(advice.value * 100));
		case 'share':
			return t('setup.evidence.share', Math.round(advice.value * 100));
		case 'celsius':
		default:
			return t('setup.evidence.celsius', advice.value.toFixed(1));
	}
};

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
							<ul className={classes.advice_list}>
								{advice.map(item => (
									<li
										key={item.id}
										className={classes.advice}
										data-confidence={item.confidence}
									>
										<div className={classes.advice_header}>
											<h3 className={classes.advice_title}>
												{t(
													`setup.advice.${item.id}.title` as TTranslationKey,
												)}
											</h3>
											<span className={classes.badge}>
												{t(
													`setup.confidence.${item.confidence}` as TTranslationKey,
												)}
											</span>
										</div>
										<p className={classes.text}>
											{t(`setup.advice.${item.id}.why` as TTranslationKey)}{' '}
											<span className={classes.muted}>
												{evidenceText(t, item)}
											</span>
										</p>
										{item.changes.map((change, index) => (
											<p
												key={change.field}
												className={classes.change}
												data-is-alternative={index > 0}
											>
												{index === 0 ? '→ ' : `${t('setup.or')} `}
												{changeText(t, change)}
											</p>
										))}
									</li>
								))}
							</ul>
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
