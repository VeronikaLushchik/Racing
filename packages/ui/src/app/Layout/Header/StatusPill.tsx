import React, { FC } from 'react';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryMeta } from '../../../modules/telemetry/useTelemetry';

import classes from './statusPill.module.scss';

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
			className={classes.status_pill}
			data-relay-state={state}
			role="status"
		>
			<span className={classes.status_dot} />
			<span className={classes.status_label}>{label}</span>
			<span className={classes.status_detail}>{detail}</span>
		</div>
	);
};

export default StatusPill;
