import React, { FC, useRef, useState } from 'react';

import Button from '~@ui/Button/Button';

import useTranslation from '~@engines/translations/useTranslation';
import { fileKindOf, formatBytes, TFileKind } from './uploadFunctions';

import { UPLOAD_ACCEPT } from './uploadConstants';

import classes from './upload.module.scss';

const KIND_KEYS: Record<TFileKind, TTranslationKey> = {
	session: 'upload.kind.session',
	frames: 'upload.kind.frames',
	csv: 'upload.kind.csv',
	recording: 'upload.kind.recording',
	unknown: 'upload.kind.unknown',
};

interface DropZoneProps {
	files: File[];
	isDisabled: boolean;
	onAdd: (files: File[]) => void;
	onRemove: (name: string) => void;
}

/** Drag files here or pick them; the list shows what each file looks like before sending. */
const DropZone: FC<DropZoneProps> = props => {
	const { files, isDisabled, onAdd, onRemove } = props;

	const t = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		setIsDragging(false);
		if (isDisabled) return;
		const dropped = Array.from(event.dataTransfer.files ?? []);
		if (dropped.length) onAdd(dropped);
	};

	return (
		<div className={classes.drop_zone_wrap}>
			<div
				className={classes.drop_zone}
				data-is-dragging={isDragging}
				data-is-disabled={isDisabled}
				role="button"
				tabIndex={0}
				onClick={() => !isDisabled && inputRef.current?.click()}
				onKeyDown={event => {
					if ((event.key === 'Enter' || event.key === ' ') && !isDisabled) {
						event.preventDefault();
						inputRef.current?.click();
					}
				}}
				onDragOver={event => {
					event.preventDefault();
					if (!isDisabled) setIsDragging(true);
				}}
				onDragLeave={() => setIsDragging(false)}
				onDrop={handleDrop}
			>
				<span className={classes.drop_icon}>⇪</span>
				<span className={classes.drop_title}>{t('upload.dropTitle')}</span>
				<span className={classes.drop_hint}>{t('upload.dropHint')}</span>
				<input
					ref={inputRef}
					className={classes.hidden_input}
					type="file"
					multiple
					accept={UPLOAD_ACCEPT}
					disabled={isDisabled}
					onChange={event => {
						const picked = Array.from(event.target.files ?? []);
						if (picked.length) onAdd(picked);
						event.target.value = '';
					}}
				/>
			</div>
			{files.length > 0 && (
				<ul className={classes.file_list}>
					{files.map(file => (
						<li
							key={file.name}
							className={classes.file_row}
						>
							<span className={classes.file_name}>{file.name}</span>
							<span className={classes.file_kind}>
								{t(KIND_KEYS[fileKindOf(file.name)])}
							</span>
							<span className={classes.file_size}>{formatBytes(file.size)}</span>
							<Button
								variant="text"
								size="xs"
								disabled={isDisabled}
								onClick={() => onRemove(file.name)}
							>
								{t('upload.remove')}
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
};

export default DropZone;
