import React, { FC } from 'react';

import Panel from '~@ui/Panel/Panel';
import DegradationChart from './DegradationChart';

import useTranslation from '~@engines/translations/useTranslation';
import { formatLapTime } from 'src/services/functions';
import useDegradation from '../common/useDegradation';
import { formatLapsLeft, formatSigned, trendTone } from '../common/strategyFunctions';

import { MIN_FIT_LAPS } from '~@engines/racingMath/tyreDegradationModel';
import { TYRE_WINDOW_C, WHEELS } from 'src/pages/live/carHealth/carHealthConstants';
import { HIGH_DEGRADATION_S, WARNING_LAPS, WEAR_LIMIT } from '../common/strategyConstants';

import classes from '../common/strategy.module.scss';

const TyreDegradation: FC = () => {
	const t = useTranslation();
	const result = useDegradation();

	if (!result) {
		return (
			<Panel title={t('degradation.title')}>
				<p className={classes.empty_text}>{t('degradation.needLaps', MIN_FIT_LAPS)}</p>
				<p className={classes.empty_hint}>{t('analysis.recordingHint')}</p>
			</Panel>
		);
	}

	const { stint, fitLaps, degradationS, fuelPerLapL, forecast, temperature, wear } = result;
	const nextLap = forecast[0];
	const lastLap = stint[stint.length - 1];

	const wheelName = (index: number) => t(`car.${WHEELS[index]}` as TTranslationKey);
	const warnings = [
		...(temperature ?? []).flatMap((trend, i) =>
			trend.lapsLeft !== null && trend.lapsLeft <= WARNING_LAPS
				? [
						t(
							'degradation.warningTemperature',
							wheelName(i),
							formatLapsLeft(trend.lapsLeft),
						),
					]
				: [],
		),
		...(wear ?? []).flatMap((trend, i) =>
			trend.lapsLeft !== null && trend.lapsLeft <= WARNING_LAPS
				? [t('degradation.warningWear', wheelName(i), formatLapsLeft(trend.lapsLeft))]
				: [],
		),
		...(degradationS > HIGH_DEGRADATION_S
			? [t('degradation.warningHigh', formatSigned(degradationS, 2))]
			: []),
	];

	return (
		<div className={classes.strategy_page}>
			{warnings.length > 0 && (
				<div
					className={classes.banner}
					role="alert"
				>
					{warnings.join(' · ')}
				</div>
			)}

			<div className={classes.stats}>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('degradation.rate')}</span>
					<strong
						className={classes.stat_value}
						data-tone={degradationS > HIGH_DEGRADATION_S ? 'warning' : undefined}
					>
						{formatSigned(degradationS, 3, ' s')}
					</strong>
					<span className={classes.stat_hint}>
						{t('degradation.rateHint', fitLaps.length)}
					</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('degradation.nextLap')}</span>
					<strong className={classes.stat_value}>
						{formatLapTime(nextLap ? nextLap.lapTimeS * 1000 : null)}
					</strong>
					<span className={classes.stat_hint}>
						{nextLap
							? t(
									'degradation.band',
									`±${((nextLap.high - nextLap.low) / 2).toFixed(2)} s`,
								)
							: ''}
					</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('degradation.tyreAge')}</span>
					<strong className={classes.stat_value}>{lastLap.tyreAge}</strong>
					<span className={classes.stat_hint}>{t('degradation.tyreAgeHint')}</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('degradation.fuelPerLap')}</span>
					<strong className={classes.stat_value}>
						{fuelPerLapL === null ? '—' : `${fuelPerLapL.toFixed(2)} L`}
					</strong>
					<span className={classes.stat_hint}>{t('degradation.fuelHint')}</span>
				</div>
			</div>

			<div className={classes.columns}>
				<Panel
					title={t('degradation.chart')}
					subtitle={t('degradation.chartHint')}
					className={classes.chart_panel}
				>
					<DegradationChart
						result={result}
						ariaLabel={t('degradation.chart')}
					/>
				</Panel>
				<Panel
					title={t('degradation.tyres')}
					subtitle={t(
						'degradation.tyresHint',
						TYRE_WINDOW_C.min,
						TYRE_WINDOW_C.max,
						Math.round(WEAR_LIMIT * 100),
					)}
				>
					{!temperature && !wear ? (
						<p className={classes.empty_text}>{t('common.notAvailable')}</p>
					) : (
						<table className={classes.table}>
							<thead>
								<tr>
									<th />
									<th>{t('degradation.temp')}</th>
									<th>{t('degradation.perLap')}</th>
									<th>{t('degradation.lapsLeft')}</th>
									<th>{t('degradation.wear')}</th>
									<th>{t('degradation.lapsLeft')}</th>
								</tr>
							</thead>
							<tbody>
								{WHEELS.map((wheel, i) => {
									const temp = temperature?.[i];
									const worn = wear?.[i];
									return (
										<tr key={wheel}>
											<th>{wheelName(i)}</th>
											<td>
												{temp?.current == null
													? '—'
													: `${temp.current.toFixed(0)}°`}
											</td>
											<td>{formatSigned(temp?.slope ?? null, 1, '°')}</td>
											<td data-tone={temp ? trendTone(temp) : undefined}>
												{formatLapsLeft(temp?.lapsLeft ?? null)}
											</td>
											<td>
												{worn?.current == null
													? '—'
													: `${Math.round(worn.current * 100)}%`}
											</td>
											<td data-tone={worn ? trendTone(worn) : undefined}>
												{formatLapsLeft(worn?.lapsLeft ?? null)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</Panel>
			</div>
		</div>
	);
};

export default TyreDegradation;
