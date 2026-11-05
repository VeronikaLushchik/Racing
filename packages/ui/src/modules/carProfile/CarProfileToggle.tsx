import React, { FC, useCallback, useMemo } from 'react';

import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';

import useTranslation from '~@engines/translations/useTranslation';
import { carProfileChoice, useCarProfile } from './carProfile';

import { CAR_PROFILE_IDS, TCarProfileId } from '~@engines/racingMath/carProfiles';
import { TOption } from 'src/typings';

const PROFILE_LABEL = {
	gt3: 'carProfile.gt3',
	f1: 'carProfile.f1',
	road: 'carProfile.road',
} as const;

/** Picks the car class whose fuel effect, tyre window and pit loss the models use. */
const CarProfileToggle: FC = () => {
	const t = useTranslation();
	const profile = useCarProfile();

	const options = useMemo<TOption<TCarProfileId>[]>(
		() => CAR_PROFILE_IDS.map(id => ({ value: id, label: t(PROFILE_LABEL[id]) })),
		[t],
	);

	const handleSet = useCallback((value: TCarProfileId) => carProfileChoice.set(value), []);

	return (
		<SegmentedToggle
			value={profile.id}
			options={options}
			onSet={handleSet}
			ariaLabel={t('carProfile.label')}
		/>
	);
};

export default CarProfileToggle;
