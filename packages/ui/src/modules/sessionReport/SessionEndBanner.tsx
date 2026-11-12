import React, { FC, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Button from '~@ui/Button/Button';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { findBestRecord } from 'src/pages/analysis/common/analysisFunctions';
import { formatLapTime } from 'src/services/functions';

import { appUrl } from 'src/constants/apiConstants';
import { pagesConfig } from 'src/constants/pagesConfig';

import classes from './sessionEndBanner.module.scss';

const reportPath = (): string => {
	const analysis = pagesConfig.analysis;
	return appUrl(`${analysis.path}${analysis.tabs?.report?.path ?? ''}`);
};

/** Offers the session report once the stream stops after a session with laps. */
const SessionEndBanner: FC = () => {
	const t = useTranslation();
	const { pathname } = useLocation();
	const { sessionEndedAt, lapRecords } = useTelemetryMeta();

	const [dismissedAt, setDismissedAt] = useState<number | null>(null);

	const path = reportPath();
	if (sessionEndedAt === null || dismissedAt === sessionEndedAt || pathname.startsWith(path)) {
		return null;
	}

	const best = findBestRecord(lapRecords);

	return (
		<div
			className={classes.banner}
			role="status"
		>
			<span className={classes.text}>
				{t('report.banner', lapRecords.length, formatLapTime(best?.lapTimeMs))}
			</span>
			<Link
				to={path}
				className={classes.link}
			>
				{t('report.bannerOpen')}
			</Link>
			<Button
				variant="text"
				size="sm"
				onClick={() => setDismissedAt(sessionEndedAt)}
			>
				{t('report.bannerDismiss')}
			</Button>
		</div>
	);
};

export default SessionEndBanner;
