/** @format */

import React, { FC, ReactNode, useEffect, useMemo, useState } from 'react';

import { TClientMessage } from '@racing/shared';

import { TelemetrySocket } from '../websockets';

import telemetryContext from './telemetryContext';

import { WS_URL } from 'src/constants/serverAddress';

import { TelemetryStore } from './telemetryStore';

interface TelemetryProviderProps {
	children: ReactNode;
}

const TelemetryProvider: FC<TelemetryProviderProps> = props => {
	const { children } = props;

	const [store] = useState(() => new TelemetryStore());
	const [socket] = useState(() => new TelemetrySocket(WS_URL, store));

	const value = useMemo(
		() => ({ store, send: (message: TClientMessage) => socket.send(message) }),
		[store, socket],
	);

	useEffect(() => {
		socket.connect();
		return () => socket.close();
	}, [socket]);

	return <telemetryContext.Provider value={value}>{children}</telemetryContext.Provider>;
};

export default TelemetryProvider;
