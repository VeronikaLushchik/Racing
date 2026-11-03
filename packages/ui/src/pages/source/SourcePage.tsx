/** @format */

import React, { FC, useCallback, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { TSourceKind, TSourceOptions } from '@racing/shared';

import Button from '~@ui/Button/Button';
import Field from '~@ui/Field/Field';
import PageContent from '~@ui/PageContent/PageContent';
import SourceCard from './SourceCard';

import useTranslation from '~@engines/translations/useTranslation';
import { safeStorage } from 'src/services/functions';
import useTelemetry, { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { useF1Drivers, useF1Sessions, useRecordings } from './sourceQueries';

import { CONSOLE_IP_STORAGE_KEY } from 'src/constants/commonConstants';
import { F1_SEASONS, PLAYBACK_RATES } from './sourceConstants';

import classes from './source.module.scss';

const SourcePage: FC = () => {
	const t = useTranslation();
	const history = useHistory();
	const { send } = useTelemetry();
	const { relaySource, relayState, relayMessage, connection } = useTelemetryMeta();

	const [consoleIp, setConsoleIp] = useState(() => safeStorage.get(CONSOLE_IP_STORAGE_KEY) ?? '');
	const [year, setYear] = useState(F1_SEASONS[1]);
	const [sessionKey, setSessionKey] = useState<number | null>(null);
	const [driverNumber, setDriverNumber] = useState<number | null>(null);
	const [f1Rate, setF1Rate] = useState(1);
	const [mockRate, setMockRate] = useState(1);
	const [recording, setRecording] = useState('');
	const [replayRate, setReplayRate] = useState(1);

	const isRelayOnline = connection === 'open';
	const { f1Sessions, isF1SessionsLoading, isF1SessionsError } = useF1Sessions(
		year,
		isRelayOnline,
	);
	const { f1Drivers, isF1DriversLoading } = useF1Drivers(sessionKey);
	const { recordings } = useRecordings();

	const start = useCallback(
		(source: TSourceKind, options: TSourceOptions) => {
			send({ type: 'selectSource', source, options });
			history.push('/live/driver');
		},
		[send, history],
	);

	const handleStartGt7 = useCallback(() => {
		safeStorage.set(CONSOLE_IP_STORAGE_KEY, consoleIp.trim());
		start('gt7', { consoleIp: consoleIp.trim() });
	}, [consoleIp, start]);

	const handleStop = useCallback(() => send({ type: 'stopSource' }), [send]);

	const isActive = (kind: TSourceKind): boolean => relaySource === kind && relayState !== 'idle';

	const rateSelect = (value: number, onChange: (rate: number) => void) => (
		<Field label={t('common.speedRate')}>
			<select
				value={value}
				onChange={event => onChange(Number(event.target.value))}
			>
				{PLAYBACK_RATES.map(rate => (
					<option
						key={rate}
						value={rate}
					>
						×{rate}
					</option>
				))}
			</select>
		</Field>
	);

	return (
		<PageContent>
			<div className={classes.intro}>
				<div>
					<h1 className={classes.intro_title}>{t('source.title')}</h1>
					<p className={classes.intro_text}>{t('source.intro')}</p>
					{relayState === 'error' && relayMessage && (
						<p className={classes.error_text}>{relayMessage}</p>
					)}
				</div>
				{relayState !== 'idle' && (
					<Button
						variant="secondary"
						onClick={handleStop}
					>
						{t('common.stop')}
					</Button>
				)}
			</div>
			<div className={classes.cards_grid}>
				<SourceCard
					title={t('source.gt7Title')}
					description={t('source.gt7Description')}
					isActive={isActive('gt7')}
					canStart={isRelayOnline && consoleIp.trim().length > 0}
					onStart={handleStartGt7}
				>
					<Field
						label={t('source.consoleIp')}
						hint={t('source.consoleIpHint')}
					>
						<input
							value={consoleIp}
							placeholder="192.168.1.50"
							inputMode="decimal"
							onChange={event => setConsoleIp(event.target.value)}
						/>
					</Field>
				</SourceCard>

				<SourceCard
					title={t('source.f1Title')}
					description={t('source.f1Description')}
					isActive={isActive('f1')}
					canStart={isRelayOnline && sessionKey !== null && driverNumber !== null}
					onStart={() =>
						start('f1', {
							f1SessionKey: sessionKey ?? undefined,
							f1DriverNumber: driverNumber ?? undefined,
							rate: f1Rate,
						})
					}
				>
					<Field label={t('source.year')}>
						<select
							value={year}
							onChange={event => {
								setYear(Number(event.target.value));
								setSessionKey(null);
								setDriverNumber(null);
							}}
						>
							{F1_SEASONS.map(season => (
								<option
									key={season}
									value={season}
								>
									{season}
								</option>
							))}
						</select>
					</Field>
					<Field label={t('source.race')}>
						<select
							value={sessionKey ?? ''}
							disabled={isF1SessionsLoading || f1Sessions.length === 0}
							onChange={event => {
								setSessionKey(
									event.target.value ? Number(event.target.value) : null,
								);
								setDriverNumber(null);
							}}
						>
							<option value="">
								{isF1SessionsLoading ? t('common.loading') : '—'}
							</option>
							{f1Sessions.map(session => (
								<option
									key={session.session_key}
									value={session.session_key}
								>
									{session.date_start.slice(0, 10)} · {session.country_name}
								</option>
							))}
						</select>
					</Field>
					<Field label={t('source.driver')}>
						<select
							value={driverNumber ?? ''}
							disabled={sessionKey === null || isF1DriversLoading}
							onChange={event =>
								setDriverNumber(
									event.target.value ? Number(event.target.value) : null,
								)
							}
						>
							<option value="">
								{isF1DriversLoading ? t('common.loading') : '—'}
							</option>
							{f1Drivers.map(driver => (
								<option
									key={driver.driver_number}
									value={driver.driver_number}
								>
									#{driver.driver_number} {driver.full_name} · {driver.team_name}
								</option>
							))}
						</select>
					</Field>
					{rateSelect(f1Rate, setF1Rate)}
					{isF1SessionsError && (
						<p className={classes.error_text}>{t('source.f1Offline')}</p>
					)}
				</SourceCard>

				<SourceCard
					title={t('source.mockTitle')}
					description={t('source.mockDescription')}
					isActive={isActive('mock')}
					canStart={isRelayOnline}
					onStart={() => start('mock', { rate: mockRate })}
				>
					{rateSelect(mockRate, setMockRate)}
				</SourceCard>

				<SourceCard
					title={t('source.replayTitle')}
					description={t('source.replayDescription')}
					isActive={isActive('replay')}
					canStart={isRelayOnline && recording !== ''}
					onStart={() => start('replay', { file: recording, rate: replayRate })}
				>
					{recordings.length === 0 ? (
						<p className={classes.intro_text}>{t('source.noRecordings')}</p>
					) : (
						<Field label={t('source.recording')}>
							<select
								value={recording}
								onChange={event => setRecording(event.target.value)}
							>
								<option value="">—</option>
								{recordings.map(name => (
									<option
										key={name}
										value={name}
									>
										{name}
									</option>
								))}
							</select>
						</Field>
					)}
					{rateSelect(replayRate, setReplayRate)}
				</SourceCard>
			</div>
		</PageContent>
	);
};

export default SourcePage;
