import React, { FC } from 'react';

import Field from '~@ui/Field/Field';

import useTranslation from '~@engines/translations/useTranslation';
import { formatLapTime } from 'src/services/functions';

import { TLapRecord } from 'src/modules/telemetry/lapTypings';

interface LapSelectProps {
	label: string;
	records: TLapRecord[];
	value: number | null;
	bestLap: number | null;
	onSet: (lap: number) => void;
	className?: string;
}

const LapSelect: FC<LapSelectProps> = props => {
	const { label, records, value, bestLap, onSet, className } = props;

	const t = useTranslation();

	return (
		<Field
			label={label}
			className={className}
		>
			<select
				value={value ?? ''}
				onChange={event => onSet(Number(event.target.value))}
			>
				{[...records].reverse().map(record => {
					const notes = [
						record.lap === bestLap && t('analysis.best'),
						!record.isValid && t('timing.invalid'),
						record.isPitLap && t('timing.pit'),
					].filter(Boolean);
					return (
						<option
							key={record.lap}
							value={record.lap}
						>
							{t('analysis.lapOption', record.lap, formatLapTime(record.lapTimeMs))}
							{notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
						</option>
					);
				})}
			</select>
		</Field>
	);
};

export default LapSelect;
