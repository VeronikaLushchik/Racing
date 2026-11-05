import React, { FC, useState } from 'react';

import Button from '~@ui/Button/Button';
import Field from '~@ui/Field/Field';
import Panel from '~@ui/Panel/Panel';

import useTranslation from '~@engines/translations/useTranslation';
import { setupSheets, useActiveSetup, useSetupSheets } from 'src/modules/carSetup/setupSheets';

import { SETUP_FIELD_SPECS, TSetupField } from '~@engines/racingMath/setupAdvisorModel';
import { SETUP_GROUPS } from '../common/setupConstants';

import classes from '../common/setup.module.scss';

/** The driver copies the car's setup from GT7 here, so advice can name exact new values. */
const SetupSheet: FC = () => {
	const t = useTranslation();
	const { sheets } = useSetupSheets();
	const active = useActiveSetup();
	const [newName, setNewName] = useState('');

	const handleCreate = () => {
		setupSheets.create(newName.trim() || t('setup.untitled'));
		setNewName('');
	};

	const input = (field: TSetupField) => {
		if (!active) return null;
		const spec = SETUP_FIELD_SPECS[field];
		const value = active.values[field];
		return (
			<input
				type="number"
				min={spec.min}
				max={spec.max}
				step={spec.step}
				value={value ?? ''}
				placeholder="—"
				aria-label={field}
				onChange={event => {
					const text = event.target.value;
					const values = { ...active.values };
					if (text === '') {
						delete values[field];
					} else {
						const number = Number(text);
						if (!Number.isFinite(number)) return;
						values[field] = number;
					}
					setupSheets.update(active.id, { values });
				}}
			/>
		);
	};

	return (
		<div className={classes.setup_page}>
			<Panel
				title={t('setup.sheetTitle')}
				subtitle={t('setup.sheetHint')}
			>
				<div className={classes.toolbar}>
					{sheets.length > 0 && (
						<Field label={t('setup.car')}>
							<select
								value={active?.id ?? ''}
								onChange={event => setupSheets.select(event.target.value)}
							>
								{sheets.map(sheet => (
									<option
										key={sheet.id}
										value={sheet.id}
									>
										{sheet.name}
									</option>
								))}
							</select>
						</Field>
					)}
					<Field label={t('setup.newCar')}>
						<input
							type="text"
							value={newName}
							placeholder={t('setup.newCarPlaceholder')}
							onChange={event => setNewName(event.target.value)}
							onKeyDown={event => {
								if (event.key === 'Enter') handleCreate();
							}}
						/>
					</Field>
					<Button onClick={handleCreate}>{t('setup.add')}</Button>
					{active && (
						<Button
							variant="secondary"
							onClick={() => setupSheets.remove(active.id)}
						>
							{t('setup.delete')}
						</Button>
					)}
				</div>
			</Panel>

			{!active ? (
				<p className={classes.empty_text}>{t('setup.noSheet')}</p>
			) : (
				<div className={classes.sheet_grid}>
					{SETUP_GROUPS.map(group => (
						<Panel
							key={group.key}
							title={t(`setup.group.${group.key}` as TTranslationKey)}
						>
							<table className={classes.table}>
								<thead>
									<tr>
										<th />
										{group.rows.some(row => row.rear) ? (
											<>
												<th>{t('setup.front')}</th>
												<th>{t('setup.rear')}</th>
											</>
										) : (
											<th colSpan={2}>{t('setup.value')}</th>
										)}
									</tr>
								</thead>
								<tbody>
									{group.rows.map(row => {
										const unit = SETUP_FIELD_SPECS[row.front].unit;
										return (
											<tr key={row.key}>
												<th scope="row">
													{t(`setup.field.${row.key}` as TTranslationKey)}{' '}
													{unit && (
														<span className={classes.unit}>{unit}</span>
													)}
												</th>
												<td colSpan={row.rear ? 1 : 2}>
													{input(row.front)}
												</td>
												{row.rear && <td>{input(row.rear)}</td>}
											</tr>
										);
									})}
								</tbody>
							</table>
						</Panel>
					))}
				</div>
			)}
		</div>
	);
};

export default SetupSheet;
