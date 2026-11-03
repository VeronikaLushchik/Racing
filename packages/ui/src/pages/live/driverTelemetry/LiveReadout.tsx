/** @format */

import React, { FC } from 'react';

import useTranslation from '~@engines/translations/useTranslation';
import { formatDelta, formatLapTime } from 'src/services/functions';
import { useLatestFrame, useTelemetryValue } from 'src/modules/telemetry/useTelemetry';

import { READOUT_HZ } from './driverTelemetryConstants';

import classes from './driverTelemetry.module.scss';

const LiveReadout: FC = () => {
	const t = useTranslation();
	const frame = useLatestFrame(READOUT_HZ);
	const delta = useTelemetryValue(store => store.currentDelta(), READOUT_HZ);

	const gearLabel = !frame
		? '—'
		: frame.gear === -1
			? 'R'
			: frame.gear === 0
				? 'N'
				: String(frame.gear);
	const deltaState = delta === null ? undefined : delta <= 0 ? 'faster' : 'slower';

	return (
		<div className={classes.readout}>
			<div className={classes.gear}>
				<span className={classes.readoutLabel}>{t('driver.gear')}</span>
				<span className={classes.gearValue}>{gearLabel}</span>
			</div>
			<div className={classes.readoutGrid}>
				<div>
					<span className={classes.readoutLabel}>{t('driver.speed')}</span>
					<span className={classes.readoutValue}>
						{frame ? Math.round(frame.speed) : '—'}
					</span>
					<span className={classes.readoutUnit}>km/h</span>
				</div>
				<div>
					<span className={classes.readoutLabel}>{t('driver.rpm')}</span>
					<span className={classes.readoutValue}>{frame ? frame.rpm : '—'}</span>
				</div>
				<div>
					<span className={classes.readoutLabel}>
						{t('common.lap')} {frame?.lap ?? ''}
					</span>
					<span className={classes.readoutValue}>{formatLapTime(frame?.lapTimeMs)}</span>
				</div>
				<div>
					<span className={classes.readoutLabel}>{t('timing.delta')}</span>
					<span
						className={classes.readoutValue}
						data-delta={deltaState}
					>
						{formatDelta(delta)}
					</span>
				</div>
			</div>
		</div>
	);
};

export default LiveReadout;
