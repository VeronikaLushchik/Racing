/** @format */

import { createContext } from 'react';

import { TClientMessage } from '@racing/shared';

import { TelemetryStore } from './telemetryStore';

export interface TTelemetryContext {
	store: TelemetryStore;
	send: (message: TClientMessage) => void;
}

const telemetryContext = createContext<TTelemetryContext | null>(null);

export default telemetryContext;
