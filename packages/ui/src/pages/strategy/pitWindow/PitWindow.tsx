import React, { FC, useEffect, useMemo, useState } from 'react';

import Field from '~@ui/Field/Field';
import Panel from '~@ui/Panel/Panel';
import PitRibbon from './PitRibbon';
import StrategySimulation from './StrategySimulation';

import useTranslation from '~@engines/translations/useTranslation';
import {
	predictRejoin,
	undercutChance,
	undercutGain,
	undercutTarget,
} from '~@engines/racingMath/pitWindowModel';
import { simulateStrategy, TStopOption } from '~@engines/racingMath/strategySimulationModel';
import { useCarProfile } from 'src/modules/carProfile/carProfile';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import useDegradation from '../common/useDegradation';
import { formatSigned } from '../common/strategyFunctions';

import { MIN_FIT_LAPS } from '~@engines/racingMath/tyreDegradationModel';
import { DEFAULT_LAPS_LEFT, MAX_DELAY_LAPS, MAX_LAPS_LEFT } from '../common/strategyConstants';

import classes from '../common/strategy.module.scss';

const PitWindow: FC = () => {
	const t = useTranslation();
	const { field, session } = useTelemetryMeta();
	const degradation = useDegradation();

	const profile = useCarProfile();
	const [pitLossS, setPitLossS] = useState<number>(profile.pitLossS);
	const [delayLaps, setDelayLaps] = useState<number>(3);
	const [lapsLeft, setLapsLeft] = useState<number>(DEFAULT_LAPS_LEFT);
	const [safetyCarPct, setSafetyCarPct] = useState<number>(profile.safetyCarChance * 100);

	// A different car class brings its own pit-lane time and safety car odds; both stay editable.
	useEffect(() => setPitLossS(profile.pitLossS), [profile.pitLossS]);
	useEffect(() => setSafetyCarPct(profile.safetyCarChance * 100), [profile.safetyCarChance]);

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
			? undercutGain(degradation.degradationS, tyreAge, delayLaps, profile.warmUpLossS)
			: null;
	const target =
		degradation && tyreAge !== null && hasOpponents
			? undercutTarget(field, degradation.degradationS, tyreAge, profile.warmUpLossS)
			: null;

	const chance =
		degradation && tyreAge !== null && target
			? undercutChance(
					degradation.degradationS,
					degradation.degradationSigma,
					tyreAge,
					delayLaps,
					target.intervalS,
					profile.warmUpLossS,
				)
			: null;

	const simulation = useMemo(
		() =>
			degradation
				? simulateStrategy({
						state: degradation.state,
						noiseS: degradation.noiseS,
						lapsRemaining: lapsLeft,
						pitLossS,
						warmUpLossS: profile.warmUpLossS,
						safetyCarChance: safetyCarPct / 100,
					})
				: null,
		[degradation, lapsLeft, pitLossS, profile.warmUpLossS, safetyCarPct],
	);
	const lastLap = stint?.[stint.length - 1].lap ?? 0;
	const runnerUp = simulation
		? simulation.options
				.filter(option => option !== simulation.best)
				.reduce<TStopOption | null>(
					(acc, option) => (!acc || option.meanS < acc.meanS ? option : acc),
					null,
				)
		: null;
	const bestLapText = (stopIn: number, isNoStop: boolean) =>
		isNoStop ? t('simulation.noStop') : t('simulation.lap', lastLap + stopIn);

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
						<Field
							label={t('simulation.lapsLeft')}
							hint={t('simulation.lapsLeftHint')}
						>
							<input
								type="number"
								min={2}
								max={MAX_LAPS_LEFT}
								step={1}
								value={lapsLeft}
								onChange={event => {
									const value = Math.round(Number(event.target.value));
									if (
										Number.isFinite(value) &&
										value >= 2 &&
										value <= MAX_LAPS_LEFT
									) {
										setLapsLeft(value);
									}
								}}
							/>
						</Field>
						<Field
							label={t('simulation.safetyCar')}
							hint={t('simulation.safetyCarHint')}
						>
							<input
								type="number"
								min={0}
								max={20}
								step={0.5}
								value={safetyCarPct}
								onChange={event => {
									const value = Number(event.target.value);
									if (Number.isFinite(value) && value >= 0 && value <= 20) {
										setSafetyCarPct(value);
									}
								}}
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
						{target && chance !== null && target.lapsNeeded !== null && (
							<p className={classes.empty_hint}>
								{t('pit.chance', Math.round(chance * 100), delayLaps)}
							</p>
						)}
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

			<Panel
				title={t('simulation.title')}
				subtitle={
					simulation
						? t(
								'simulation.hint',
								simulation.runs,
								(degradation?.noiseS ?? 0).toFixed(2),
							)
						: undefined
				}
				className={simulation ? classes.chart_panel : undefined}
			>
				{!simulation ? (
					<p className={classes.empty_text}>{t('pit.needDegradation', MIN_FIT_LAPS)}</p>
				) : (
					<StrategySimulation
						result={simulation}
						lastLap={lastLap}
						ariaLabel={t('simulation.title')}
					/>
				)}
			</Panel>

			{simulation && (
				<div className={classes.stats}>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('simulation.best')}</span>
						<strong
							className={classes.stat_value}
							data-tone="good"
						>
							{bestLapText(simulation.best.stopIn, simulation.best.isNoStop)}
						</strong>
						<span className={classes.stat_hint}>
							{runnerUp
								? t(
										'simulation.runnerUp',
										bestLapText(runnerUp.stopIn, runnerUp.isNoStop),
										runnerUp.meanS.toFixed(1),
									)
								: ''}
						</span>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('simulation.bestShare')}</span>
						<strong className={classes.stat_value}>
							{Math.round(simulation.best.bestShare * 100)}%
						</strong>
						<span className={classes.stat_hint}>{t('simulation.bestShareHint')}</span>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('simulation.vsNoStop')}</span>
						<strong className={classes.stat_value}>
							{simulation.noStop && !simulation.best.isNoStop
								? `−${simulation.noStop.meanS.toFixed(1)} s`
								: '—'}
						</strong>
						<span className={classes.stat_hint}>{t('simulation.vsNoStopHint')}</span>
					</div>
					<div className={classes.stat}>
						<span className={classes.stat_label}>{t('simulation.safetyCarRuns')}</span>
						<strong className={classes.stat_value}>
							{Math.round(simulation.safetyCarShare * 100)}%
						</strong>
						<span className={classes.stat_hint}>
							{t('simulation.safetyCarRunsHint')}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default PitWindow;
