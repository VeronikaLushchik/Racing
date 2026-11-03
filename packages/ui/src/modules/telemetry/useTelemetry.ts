/** @format */

import { useContext, useSyncExternalStore } from 'react';

import { TTelemetryFrame } from '@racing/shared';

import telemetryContext, { TTelemetryContext } from './telemetryContext';

import { TelemetryStore, TTelemetryMeta } from './telemetryStore';

const useTelemetry = (): TTelemetryContext => {
	const context = useContext(telemetryContext);
	if (!context) throw new Error('useTelemetry must be used inside TelemetryProvider');
	return context;
};

export const useTelemetryStore = (): TelemetryStore => useTelemetry().store;

export const useTelemetryMeta = (): TTelemetryMeta => {
	const { store } = useTelemetry();
	return useSyncExternalStore(store.subscribeMeta, store.getMeta);
};

/** Re-renders at most `hz` times per second with a value selected from the store. */
export const useTelemetryValue = <T>(select: (store: TelemetryStore) => T, hz = 10): T => {
	const { store } = useTelemetry();
	return useSyncExternalStore(
		listener => {
			let seen = store.frameVersion;
			const id = window.setInterval(() => {
				if (store.frameVersion !== seen) {
					seen = store.frameVersion;
					listener();
				}
			}, 1000 / hz);
			return () => window.clearInterval(id);
		},
		() => select(store),
	);
};

/** Latest frame, refreshed at most `hz` times per second. */
export const useLatestFrame = (hz = 10): TTelemetryFrame | null =>
	useTelemetryValue(store => store.latestFrame, hz);

export default useTelemetry;
