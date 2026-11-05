import { TSetupField } from '~@engines/racingMath/setupAdvisorModel';

/** How often the advisor re-reads the evidence, Hz. */
export const ADVISOR_HZ = 1;

export interface TSetupRow {
	key: string;
	front: TSetupField;
	/** Missing for settings that are one number for the whole car. */
	rear?: TSetupField;
}

export interface TSetupGroup {
	key: 'suspension' | 'aero' | 'differential' | 'brakes';
	rows: TSetupRow[];
}

/** The setup sheet laid out like the GT7 settings screen. */
export const SETUP_GROUPS: TSetupGroup[] = [
	{
		key: 'suspension',
		rows: [
			{ key: 'rideHeight', front: 'rideHeightF', rear: 'rideHeightR' },
			{ key: 'spring', front: 'springF', rear: 'springR' },
			{ key: 'arb', front: 'arbF', rear: 'arbR' },
			{ key: 'compression', front: 'compressionF', rear: 'compressionR' },
			{ key: 'extension', front: 'extensionF', rear: 'extensionR' },
			{ key: 'camber', front: 'camberF', rear: 'camberR' },
			{ key: 'toe', front: 'toeF', rear: 'toeR' },
		],
	},
	{ key: 'aero', rows: [{ key: 'downforce', front: 'downforceF', rear: 'downforceR' }] },
	{
		key: 'differential',
		rows: [
			{ key: 'lsdInitial', front: 'lsdInitial' },
			{ key: 'lsdAccel', front: 'lsdAccel' },
			{ key: 'lsdBraking', front: 'lsdBraking' },
		],
	},
	{ key: 'brakes', rows: [{ key: 'brakeBalance', front: 'brakeBalance' }] },
];

/** Translation key of the setting a field belongs to, with its axle when it has one. */
export const FIELD_LABEL: Record<TSetupField, { row: string; axle: 'front' | 'rear' | null }> =
	SETUP_GROUPS.flatMap(group => group.rows).reduce(
		(acc, row) => {
			acc[row.front] = { row: row.key, axle: row.rear ? 'front' : null };
			if (row.rear) acc[row.rear] = { row: row.key, axle: 'rear' };
			return acc;
		},
		{} as Record<TSetupField, { row: string; axle: 'front' | 'rear' | null }>,
	);
