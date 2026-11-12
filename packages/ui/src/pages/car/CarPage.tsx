import React, { FC } from 'react';

import PageContent from '~@ui/PageContent/PageContent';
import PageSection from '~@ui/PageSection/PageSection';
import CarHealth from 'src/pages/live/carHealth/CarHealth';
import SetupAdvisor from 'src/pages/setup/advisor/SetupAdvisor';
import SetupSheet from 'src/pages/setup/sheet/SetupSheet';
import TyreDegradation from 'src/pages/strategy/tyreDegradation/TyreDegradation';

import useTranslation from '~@engines/translations/useTranslation';

/** For the car: its condition now, how the tyres wear, and what to change in the setup. */
const CarPage: FC = () => {
	const t = useTranslation();

	return (
		<PageContent>
			<PageSection
				title={t('car.sectionHealth')}
				hint={t('car.sectionHealthHint')}
			>
				<CarHealth />
			</PageSection>
			<PageSection
				title={t('car.sectionTyres')}
				hint={t('car.sectionTyresHint')}
			>
				<TyreDegradation />
			</PageSection>
			<PageSection
				title={t('car.sectionAdvice')}
				hint={t('car.sectionAdviceHint')}
			>
				<SetupAdvisor />
			</PageSection>
			<PageSection
				title={t('car.sectionSheet')}
				hint={t('car.sectionSheetHint')}
			>
				<SetupSheet />
			</PageSection>
		</PageContent>
	);
};

export default CarPage;
