import React, { FC } from 'react';

import { TImportErrorKey, TImportNote } from '@racing/shared';

import Field from '~@ui/Field/Field';
import SourceCard from './SourceCard';

import useTranslation from '~@engines/translations/useTranslation';
import { formatLapTime } from 'src/services/functions';
import { ServerStatusError } from 'src/services/serverStatusError';
import { useImportFiles } from './sourceQueries';

import { IMPORT_ACCEPT } from './sourceConstants';

import classes from './source.module.scss';

const ERROR_KEYS: Record<TImportErrorKey, TTranslationKey> = {
	importNoFiles: 'source.importError.noFiles',
	importUnknownFormat: 'source.importError.unknownFormat',
	importMissingFrames: 'source.importError.missingFrames',
	importMissingSession: 'source.importError.missingSession',
	importChannelsMismatch: 'source.importError.channelsMismatch',
	importNoSpeed: 'source.importError.noSpeed',
	importEmpty: 'source.importError.empty',
	importTooLarge: 'source.importError.tooLarge',
};

const NOTE_KEYS: Record<TImportNote, TTranslationKey> = {
	positionEstimated: 'source.importNote.positionEstimated',
	trackLengthEstimated: 'source.importNote.trackLengthEstimated',
	mapMirrored: 'source.importNote.mapMirrored',
};

interface ImportCardProps {
	isRelayOnline: boolean;
	isActive: boolean;
	onStart: (file: string) => void;
	children?: React.ReactNode;
}

/** Opens a recorded GT7 / Assetto Corsa session and plays it through the replay source. */
const ImportCard: FC<ImportCardProps> = props => {
	const { isRelayOnline, isActive, onStart, children } = props;

	const t = useTranslation();
	const { importFiles, importResult, importError, isImporting } = useImportFiles();

	const errorKey =
		importError instanceof ServerStatusError && importError.messageKey
			? ERROR_KEYS[importError.messageKey as TImportErrorKey]
			: null;

	return (
		<SourceCard
			title={t('source.importTitle')}
			description={t('source.importDescription')}
			isActive={isActive}
			canStart={isRelayOnline && !isImporting && importResult !== null}
			onStart={() => importResult && onStart(importResult.file)}
		>
			<Field
				label={t('source.importFiles')}
				hint={t('source.importFilesHint')}
			>
				<input
					type="file"
					multiple
					accept={IMPORT_ACCEPT}
					disabled={!isRelayOnline || isImporting}
					onChange={event => {
						const files = Array.from(event.target.files ?? []);
						if (files.length) importFiles(files);
					}}
				/>
			</Field>
			{isImporting && <p className={classes.intro_text}>{t('source.importing')}</p>}
			{importError !== null && importError !== undefined && !isImporting && (
				<p className={classes.error_text}>
					{errorKey ? t(errorKey) : t('source.importError.failed')}
				</p>
			)}
			{importResult && !isImporting && (
				<div className={classes.import_summary}>
					<span className={classes.import_title}>{importResult.title}</span>
					<span>
						{t(
							'source.importLaps',
							importResult.validLaps,
							importResult.laps,
							formatLapTime(importResult.bestLapMs),
						)}
					</span>
					{importResult.notes.map(note => (
						<span
							key={note}
							className={classes.import_note}
						>
							{t(NOTE_KEYS[note])}
						</span>
					))}
				</div>
			)}
			{children}
		</SourceCard>
	);
};

export default ImportCard;
