import React, { FC } from 'react';

import { TImportChannel } from '@racing/shared';

import useTranslation from '~@engines/translations/useTranslation';

import { CHANNEL_ORDER, FALLBACK_CHANNELS } from './uploadConstants';

import classes from './upload.module.scss';

interface ChannelListProps {
	channels: TImportChannel[];
}

/** What the file had: found channels lit, missing ones dimmed with what they would fill. */
const ChannelList: FC<ChannelListProps> = props => {
	const { channels } = props;

	const t = useTranslation();
	const found = new Set(channels);
	const shown = CHANNEL_ORDER.filter(channel => {
		const primary = FALLBACK_CHANNELS[channel];
		return found.has(channel) || !primary;
	});

	return (
		<ul className={classes.channel_list}>
			{shown.map(channel => (
				<li
					key={channel}
					className={classes.channel_chip}
					data-is-found={found.has(channel)}
					title={t(`upload.channelUse.${channel}` as TTranslationKey)}
				>
					<span className={classes.channel_mark}>{found.has(channel) ? '✓' : '–'}</span>
					{t(`upload.channel.${channel}` as TTranslationKey)}
				</li>
			))}
		</ul>
	);
};

export default ChannelList;
