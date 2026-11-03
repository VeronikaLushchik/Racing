import React, { FC, useMemo, useState } from 'react';

import Field from '~@ui/Field/Field';
import Panel from '~@ui/Panel/Panel';
import PitRibbon from './PitRibbon';

import useTranslation from '~@engines/translations/useTranslation';
import {
	DEFAULT_PIT_LOSS_S,
	predictRejoin,
	undercutGain,
	undercutTarget,
} from '~@engines/racingMath/pitWindowModel';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import useDegradation from '../common/useDegradation';
import { formatSigned } from '../common/strategyFunctions';

import { MIN_FIT_LAPS } from '~@engines/racingMath/tyreDegradationModel';
import { MAX_DELAY_LAPS } from '../common/strategyConstants';

import classes from '../common/strategy.module.scss';

const PitWindow: FC = () => {
	const t = useTranslation();
	const { field, session } = useTelemetryMeta();
	const degradation = useDegradation();

	const [pitLossS, setPitLossS] = useState<number>(DEFAULT_PIT_LOSS_S);
	const [delayLaps, setDelayLaps] = useState<number>(3);

	const hasOpponents = (session?.capabilities.hasOpponents ?? false) && field.length > 1;
	const player = field.find(entry => entry.isPlayer);
	const rejoin = useMemo(
		() => (hasOpponents ? predictRejoin(field, pitLossS) : null),
		[field, pitLossS, hasOpponents],
	);

	const stint = degradation?.stint;
	const tyreAge = player?.tyreAgeLaps ?? stint?.[stint.length - 1].tyreAge ?? null;
	const gain =
		degradation && tyreAge !== null
			? undercutGain(degradation.degradationS, tyreAge, delayLaps)
			: null;
	const target =
		degradation && tyreAge !== null && hasOpponents
			? undercutTarget(field, degradation.degradationS, tyreAge)
			: null;

	const neighbourText = (gapS: number | undefined) =>
		gapS === undefined ? '—' : `${gapS.toFixed(1)} s`;

	return (
		<div className={classes.strategy_page}>
			<div className={classes.columns}>
				<Panel
					title={t('pit.rejoin')}
					subtitle={hasOpponents ? t('pit.rejoinHint') : t('pit.noOpponents')}
					className={hasOpponents ? classes.ribbon_panel : undefined}
				>
					{rejoin ? (
						<PitRibbon
							field={field}
							rejoin={rejoin}
							rejoinLabel={t('pit.afterStop')}
							ariaLabel={t('pit.rejoin')}
						/>
					) : (
						<p className={classes.empty_text}>
							{hasOpponents ? t('pit.noPlayer') : t('pit.ownForecastOnly')}
						</p>
					)}
				</Panel>
				<Panel title={t('pit.settings')}>
					<div className={classes.controls}>
						<Field
							label={t('pit.pitLoss')}
							hint={t('pit.pitLossHint')}
						>
							<input
								type="number"
								min={5}
								max={60}
								step={0.5}
								value={pitLossS}
								onChange={event => {
									const value = Number(event.target.value);
									if (Number.isFinite(value) && value > 0) setPitLossS(value);
								}}
							/>
						</Field>
						<Field
							label={t('pit.delay', delayLaps)}
							hint={t('pit.delayHint')}
						>
							<input
								type="range"
								min={1}
								max={MAX_DELAY_LAPS}
								value={delayLaps}
								onChange={event => setDelayLaps(Number(event.target.value))}
							/>
						</Field>
					</div>
				</Panel>
			</div>

			{rejoin && (
				<div className={classes.stats}>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('pit.position')}</span>
						<strong className={classes.stat_value}>
							P{player?.position ?? '—'} → P{rejoin.position}
						</strong>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('pit.carAhead')}</span>
						<strong className={classes.stat_value}>
							{neighbourText(rejoin.ahead?.gapS)}
						</strong>
						<span className={classes.stat_hint}>{rejoin.ahead?.entry.name ?? ''}</span>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('pit.carBehind')}</span>
						<strong className={classes.stat_value}>
							{neighbourText(rejoin.behind?.gapS)}
						</strong>
						<span className={classes.stat_hint}>{rejoin.behind?.entry.name ?? ''}</span>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('pit.air')}</span>
						<strong
							className={classes.stat_value}
							data-tone={rejoin.isClearAir ? 'good' : 'bad'}
						>
							{rejoin.isClearAir ? t('pit.clearAir') : t('pit.traffic')}
						</strong>
					</div>
				</div>
			)}

			<Panel
				title={t('pit.undercut')}
				subtitle={t('pit.undercutHint')}
			>
				{!gain || !degradation ? (
					<p className={classes.empty_text}>{t('pit.needDegradation', MIN_FIT_LAPS)}</p>
				) : (
					<div className={classes.undercut}>
						<p className={classes.text}>
							{t(
								gain.gainS >= 0 ? 'pit.gain' : 'pit.loss',
								gain.laps,
								Math.abs(gain.gainS).toFixed(2),
							)}
						</p>
						<p className={classes.empty_hint}>
							{t(
								'pit.gainBasis',
								formatSigned(degradation.degradationS, 3),
								tyreAge ?? 0,
							)}
						</p>
						{target && (
							<p className={classes.text}>
								{target.lapsNeeded === null
									? t(
											'pit.targetNever',
											target.entry.position,
											target.entry.name,
											target.intervalS.toFixed(1),
										)
									: t(
											'pit.target',
											target.entry.position,
											target.entry.name,
											target.intervalS.toFixed(1),
											target.lapsNeeded,
										)}
							</p>
						)}
					</div>
				)}
			</Panel>
		</div>
	);
};

export default PitWindow;
