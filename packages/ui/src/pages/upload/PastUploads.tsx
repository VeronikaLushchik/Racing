import React, { FC } from 'react';

import { TImportedRecording } from '@racing/shared';

import Button from '~@ui/Button/Button';

import useTranslation from '~@engines/translations/useTranslation';
import { formatLapTime } from 'src/services/functions';
import { formatBytes } from './uploadFunctions';

import classes from './upload.module.scss';

interface PastUploadsProps {
	imports: TImportedRecording[];
	activeFile: string | null;
	canOpen: boolean;
	onOpen: (file: string) => void;
}

/** Files uploaded before; each one opens again without uploading it a second time. */
const PastUploads: FC<PastUploadsProps> = props => {
	const { imports, activeFile, canOpen, onOpen } = props;

	const t = useTranslation();

	if (imports.length === 0) {
		return <p className={classes.muted_text}>{t('upload.noPast')}</p>;
	}

	return (
		<div className={classes.table_wrap}>
			<table className={classes.table}>
				<thead>
					<tr>
						<th>{t('upload.col.session')}</th>
						<th>{t('upload.col.date')}</th>
						<th>{t('upload.col.laps')}</th>
						<th>{t('upload.col.best')}</th>
						<th>{t('upload.col.size')}</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{imports.map(item => (
						<tr
							key={item.file}
							data-is-active={item.file === activeFile}
						>
							<td className={classes.cell_title}>
								<span>{item.title}</span>
								<span className={classes.format_badge}>{item.format}</span>
							</td>
							<td>{new Date(item.createdAt).toLocaleString()}</td>
							<td>
								{item.validLaps}/{item.laps}
							</td>
							<td>{formatLapTime(item.bestLapMs)}</td>
							<td>{formatBytes(item.bytes)}</td>
							<td>
								<Button
									variant="secondary"
									size="xs"
									disabled={!canOpen}
									onClick={() => onOpen(item.file)}
								>
									{t('upload.open')}
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default PastUploads;
