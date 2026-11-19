import React, { FC, useCallback, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { TImportErrorKey, TImportResult } from '@racing/shared';

import Button from '~@ui/Button/Button';
import Field from '~@ui/Field/Field';
import PageContent from '~@ui/PageContent/PageContent';
import Panel from '~@ui/Panel/Panel';
import ChannelList from './ChannelList';
import DropZone from './DropZone';
import PastUploads from './PastUploads';

import useTranslation from '~@engines/translations/useTranslation';
import { formatLapTime } from 'src/services/functions';
import { ServerStatusError } from 'src/services/serverStatusError';
import useTelemetry, { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { formatBytes, mergeFiles, pickProblem } from './uploadFunctions';
import { useImports, useUpload } from './uploadQueries';

import { REPLAY_RATES } from 'src/pages/source/sourceConstants';
import { ANALYSIS_RATE, ERROR_KEYS, NOTE_KEYS } from './uploadConstants';

import classes from './upload.module.scss';

const FORMAT_KEYS: Record<TImportResult['format'], TTranslationKey> = {
	rtlg: 'upload.format.rtlg',
	csv: 'upload.format.csv',
	relay: 'upload.format.relay',
};

/**
 * Upload raw race data: drop recorder files, CSV logs or relay recordings, see what the file
 * holds (laps, best lap, pit stops, channels), then open it in the dashboards. Earlier uploads
 * stay listed and open again without sending them twice.
 */
const UploadPage: FC = () => {
	const t = useTranslation();
	const history = useHistory();
	const { send } = useTelemetry();
	const { connection, relaySource, relayState } = useTelemetryMeta();

	const [files, setFiles] = useState<File[]>([]);
	const [rate, setRate] = useState(8);
	const [openedFile, setOpenedFile] = useState<string | null>(null);

	const isRelayOnline = connection === 'open';
	const { state, upload, reset } = useUpload();
	const { imports } = useImports(isRelayOnline);

	const isBusy = state.phase === 'uploading' || state.phase === 'processing';
	const problem = pickProblem(files);
	const result = state.phase === 'done' ? state.result : null;
	const isReplaying = relaySource === 'replay' && relayState !== 'idle';

	const open = useCallback(
		(file: string, playbackRate: number, page: string) => {
			setOpenedFile(file);
			send({ type: 'selectSource', source: 'replay', options: { file, rate: playbackRate } });
			history.push(page);
		},
		[send, history],
	);

	const errorText = (): string => {
		if (state.phase !== 'error') return '';
		const key =
			state.error instanceof ServerStatusError && state.error.messageKey
				? ERROR_KEYS[state.error.messageKey as TImportErrorKey]
				: null;
		return key ? t(key) : t('source.importError.failed');
	};

	return (
		<PageContent>
			<div className={classes.intro}>
				<h1 className={classes.intro_title}>{t('upload.title')}</h1>
				<p className={classes.intro_text}>{t('upload.intro')}</p>
				{!isRelayOnline && <p className={classes.error_text}>{t('upload.relayOffline')}</p>}
			</div>
			<div className={classes.layout}>
				<div className={classes.main_column}>
					<Panel
						title={t('upload.filesTitle')}
						subtitle={t('upload.filesSubtitle')}
					>
						<DropZone
							files={files}
							isDisabled={!isRelayOnline || isBusy}
							onAdd={added => {
								setFiles(current => mergeFiles(current, added));
								if (state.phase !== 'idle') reset();
							}}
							onRemove={name =>
								setFiles(current => current.filter(file => file.name !== name))
							}
						/>
						{problem && (
							<p className={classes.warning_text}>
								{t(
									problem === 'missingFrames'
										? 'source.importError.missingFrames'
										: 'source.importError.missingSession',
								)}
							</p>
						)}
						<div className={classes.upload_actions}>
							<Button
								variant="primary"
								disabled={
									!isRelayOnline ||
									isBusy ||
									files.length === 0 ||
									problem !== null
								}
								onClick={() => upload(files)}
							>
								{t('upload.send')}
							</Button>
							{files.length > 0 && !isBusy && (
								<Button
									variant="text"
									onClick={() => {
										setFiles([]);
										reset();
									}}
								>
									{t('upload.clear')}
								</Button>
							)}
							{state.phase === 'uploading' && (
								<div className={classes.progress}>
									<div
										className={classes.progress_bar}
										style={{ width: `${Math.round(state.progress * 100)}%` }}
									/>
									<span>
										{t('upload.uploading', Math.round(state.progress * 100))}
									</span>
								</div>
							)}
							{state.phase === 'processing' && (
								<span className={classes.muted_text}>{t('source.importing')}</span>
							)}
							{state.phase === 'error' && (
								<span className={classes.error_text}>{errorText()}</span>
							)}
						</div>
					</Panel>

					{result && (
						<Panel
							title={result.title}
							subtitle={t(FORMAT_KEYS[result.format])}
						>
							<div className={classes.stats_grid}>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.laps')}
									</span>
									<span className={classes.stat_value}>
										{result.validLaps}/{result.laps}
									</span>
								</div>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.best')}
									</span>
									<span className={classes.stat_value}>
										{formatLapTime(result.bestLapMs)}
									</span>
								</div>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.pits')}
									</span>
									<span className={classes.stat_value}>{result.pitLaps}</span>
								</div>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.track')}
									</span>
									<span className={classes.stat_value}>
										{result.trackLength
											? `${(result.trackLength / 1000).toFixed(2)} km`
											: '—'}
									</span>
								</div>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.samples')}
									</span>
									<span className={classes.stat_value}>
										{result.frames.toLocaleString()}
									</span>
								</div>
								<div className={classes.stat}>
									<span className={classes.stat_label}>
										{t('upload.stat.size')}
									</span>
									<span className={classes.stat_value}>
										{formatBytes(result.bytes)}
									</span>
								</div>
							</div>
							{result.channels.length > 0 && (
								<>
									<h3 className={classes.block_title}>
										{t('upload.channelsTitle')}
									</h3>
									<ChannelList channels={result.channels} />
								</>
							)}
							{result.notes.map(note => (
								<p
									key={note}
									className={classes.muted_text}
								>
									{t(NOTE_KEYS[note])}
								</p>
							))}
							<div className={classes.open_actions}>
								<Field label={t('common.speedRate')}>
									<select
										value={rate}
										onChange={event => setRate(Number(event.target.value))}
									>
										{REPLAY_RATES.map(value => (
											<option
												key={value}
												value={value}
											>
												×{value}
											</option>
										))}
									</select>
								</Field>
								<Button
									variant="primary"
									disabled={!isRelayOnline}
									onClick={() => open(result.file, rate, '/driver')}
								>
									{t('upload.watch')}
								</Button>
								<Button
									variant="secondary"
									disabled={!isRelayOnline}
									onClick={() => open(result.file, ANALYSIS_RATE, '/analyst')}
								>
									{t('upload.analyse')}
								</Button>
							</div>
						</Panel>
					)}

					<Panel
						title={t('upload.pastTitle')}
						subtitle={t('upload.pastSubtitle')}
					>
						<PastUploads
							imports={imports}
							activeFile={isReplaying ? openedFile : null}
							canOpen={isRelayOnline}
							onOpen={file => open(file, ANALYSIS_RATE, '/analyst')}
						/>
					</Panel>
				</div>

				<Panel
					title={t('upload.formatsTitle')}
					className={classes.formats_panel}
				>
					<dl className={classes.formats}>
						<dt>{t('upload.format.csv')}</dt>
						<dd>{t('upload.formatHelp.csv')}</dd>
						<dd className={classes.columns_hint}>
							{t('upload.formatHelp.csvColumns')}
						</dd>
						<dt>{t('upload.format.rtlg')}</dt>
						<dd>{t('upload.formatHelp.rtlg')}</dd>
						<dt>{t('upload.format.relay')}</dt>
						<dd>{t('upload.formatHelp.relay')}</dd>
					</dl>
					<p className={classes.muted_text}>{t('upload.formatHelp.after')}</p>
				</Panel>
			</div>
		</PageContent>
	);
};

export default UploadPage;
