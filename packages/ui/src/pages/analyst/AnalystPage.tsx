import React, { FC } from 'react';

import PageContent from '~@ui/PageContent/PageContent';
import PageSection from '~@ui/PageSection/PageSection';
import GhostLap from 'src/pages/analysis/ghostLap/GhostLap';
import SessionReport from 'src/pages/analysis/sessionReport/SessionReport';
import TrackMap from 'src/pages/analysis/trackMap/TrackMap';
import Timing from 'src/pages/live/timing/Timing';
import PitWindow from 'src/pages/strategy/pitWindow/PitWindow';
import Weather from 'src/pages/strategy/weather/Weather';
import CornerMatrix from './CornerMatrix';
import LapDetailTable from './LapDetailTable';

import useTranslation from '~@engines/translations/useTranslation';

/**
 * For the analyst: the whole session on one page, from the debrief down to single corners,
 * then timing and race strategy.
 */
const AnalystPage: FC = () => {
	const t = useTranslation();

	return (
		<PageContent>
			<PageSection
				title={t('analyst.sectionDebrief')}
				hint={t('analyst.sectionDebriefHint')}
			>
				<SessionReport />
			</PageSection>
			<PageSection
				title={t('analyst.sectionLaps')}
				hint={t('analyst.sectionLapsHint')}
			>
				<LapDetailTable />
				<CornerMatrix />
			</PageSection>
			<PageSection
				title={t('analyst.sectionCompare')}
				hint={t('analyst.sectionCompareHint')}
			>
				<GhostLap />
				<TrackMap />
			</PageSection>
			<PageSection
				title={t('analyst.sectionTiming')}
				hint={t('analyst.sectionTimingHint')}
			>
				<Timing />
			</PageSection>
			<PageSection
				title={t('analyst.sectionStrategy')}
				hint={t('analyst.sectionStrategyHint')}
			>
				<PitWindow />
				<Weather />
			</PageSection>
		</PageContent>
	);
};

export default AnalystPage;
