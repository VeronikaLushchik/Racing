import React, { FC, useCallback, useMemo } from 'react';

import Field from '~@ui/Field/Field';
import Panel from '~@ui/Panel/Panel';
import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';
import WeatherChart from './WeatherChart';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { manualWeather, useManualWeather, useWeather } from 'src/modules/weather/manualWeather';
import { compassPoint, weatherAdvice } from '~@engines/racingMath/weatherModel';
import { formatSigned } from '../common/strategyFunctions';

import { TTrackCondition } from '~@engines/racingMath/weatherModel';
import { TOption } from 'src/typings';

import classes from '../common/strategy.module.scss';

const CONDITIONS: TTrackCondition[] = ['dry', 'damp', 'wet'];

const MIN_CHART_SAMPLES = 2;

const Weather: FC = () => {
	const t = useTranslation();
	const { session, weather: samples } = useTelemetryMeta();
	const manual = useManualWeather();
	const view = useWeather();

	const hasSourceWeather = view.origin === 'session';
	const advice = useMemo(() => weatherAdvice(view), [view]);

	const conditionOptions = useMemo<TOption<TTrackCondition>[]>(
		() =>
			CONDITIONS.map(condition => ({
				value: condition,
				label: t(`weather.${condition}` as TTranslationKey),
			})),
		[t],
	);

	const handleCondition = useCallback(
		(condition: TTrackCondition) => manualWeather.set({ condition }),
		[],
	);

	const numberInput = (key: 'airTempC' | 'trackTempC', min: number, max: number) => (
		<input
			type="number"
			min={min}
			max={max}
			step={1}
			value={manual[key]}
			onChange={event => {
				const value = Number(event.target.value);
				if (event.target.value !== '' && Number.isFinite(value)) {
					manualWeather.set({ [key]: Math.min(max, Math.max(min, value)) });
				}
			}}
		/>
	);

	const originText = hasSourceWeather
		? t('weather.fromSource')
		: session?.capabilities.hasWeather === false || session?.source === 'gt7'
			? t('weather.manualGt7')
			: t('weather.manual');

	return (
		<div className={classes.strategy_page}>
			<div className={classes.stats}>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('weather.track')}</span>
					<strong className={classes.stat_value}>{view.trackTempC.toFixed(1)} °C</strong>
					<span className={classes.stat_hint}>
						{!hasSourceWeather
							? '—'
							: view.trackTrendC10 === null
								? t('weather.trendUnknown')
								: t('weather.trend', formatSigned(view.trackTrendC10, 1))}
					</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('weather.air')}</span>
					<strong className={classes.stat_value}>{view.airTempC.toFixed(1)} °C</strong>
					<span className={classes.stat_hint}>
						{view.humidity === null
							? '—'
							: t('weather.humidity', Math.round(view.humidity))}
					</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('weather.condition')}</span>
					<strong
						className={classes.stat_value}
						data-tone={view.condition === 'dry' ? undefined : 'warning'}
					>
						{t(`weather.${view.condition}` as TTranslationKey)}
					</strong>
					<span className={classes.stat_hint}>{originText}</span>
				</div>
				<div className={classes.stat}>
					<span className={classes.stat_label}>{t('weather.wind')}</span>
					<strong className={classes.stat_value}>
						{view.windSpeedMs === null ? '—' : `${view.windSpeedMs.toFixed(1)} m/s`}
					</strong>
					<span className={classes.stat_hint}>
						{view.windDirectionDeg === null
							? '—'
							: t('weather.windFrom', compassPoint(view.windDirectionDeg))}
					</span>
				</div>
			</div>

			<div className={classes.columns}>
				{hasSourceWeather ? (
					<Panel
						title={t('weather.chart')}
						subtitle={t('weather.chartHint')}
						className={classes.chart_panel}
					>
						{samples.length >= MIN_CHART_SAMPLES ? (
							<WeatherChart
								samples={samples}
								ariaLabel={t('weather.chart')}
							/>
						) : (
							<p className={classes.empty_text}>{t('weather.waiting')}</p>
						)}
					</Panel>
				) : (
					<Panel
						title={t('weather.manualTitle')}
						subtitle={t('weather.manualHint')}
					>
						<div className={classes.controls}>
							<Field label={t('weather.condition')}>
								<SegmentedToggle
									value={manual.condition}
									options={conditionOptions}
									onSet={handleCondition}
									ariaLabel={t('weather.condition')}
								/>
							</Field>
							<span />
							<Field label={t('weather.track')}>
								{numberInput('trackTempC', -10, 70)}
							</Field>
							<Field label={t('weather.air')}>
								{numberInput('airTempC', -20, 50)}
							</Field>
						</div>
						<p className={classes.empty_hint}>{t('weather.noHistory')}</p>
					</Panel>
				)}

				<Panel title={t('weather.adviceTitle')}>
					<ul className={classes.advice_list}>
						{advice.map(item => (
							<li
								key={item.id}
								className={classes.text}
								data-tone={item.tone}
							>
								{t(`weather.advice.${item.id}` as TTranslationKey)}
							</li>
						))}
					</ul>
				</Panel>
			</div>
		</div>
	);
};

export default Weather;
