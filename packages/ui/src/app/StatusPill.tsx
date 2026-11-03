/** @format */

import React, { FC } from 'react';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';

import classes from './layout.module.scss';

const StatusPill: FC = () => {
	const t = useTranslation();
	const { connection, relayState, relayMessage, session } = useTelemetryMeta();

	const isOffline = connection !== 'open';
	const state = isOffline ? 'disconnected' : relayState;
	const label = isOffline ? t('status.disconnected') : t(`status.${relayState}`);
	const detail = isOffline
		? t('status.relayHint')
		: (relayMessage ?? session?.title ?? t('header.noSession'));

	return (
		<div
			className={classes.status}
			data-relay-state={state}
			role="status"
		>
			<span className={classes.statusDot} />
			<span className={classes.statusLabel}>{label}</span>
			<span className={classes.statusDetail}>{detail}</span>
		</div>
	);
};

export default StatusPill;
