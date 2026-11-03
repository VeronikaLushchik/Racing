import CarHealth from 'src/pages/live/carHealth/CarHealth';
import DriverTelemetry from 'src/pages/live/driverTelemetry/DriverTelemetry';
import Timing from 'src/pages/live/timing/Timing';
import SourcePage from 'src/pages/source/SourcePage';

import { TPagesConfig } from 'src/typings';

/** Every page and tab of the app. Routes are generated from here only. */
export const pagesConfig: TPagesConfig = {
	source: {
		path: '/source',
		title: 'Data source',
		tKey: 'pagesNames.source.source',
		Component: SourcePage,
	},
	live: {
		path: '/live',
		title: 'Live',
		tKey: 'pagesNames.live.live',
		tabs: {
			driver: {
				title: 'Driver',
				tKey: 'pagesNames.live.driverTab',
				path: '/driver',
				Component: DriverTelemetry,
			},
			car: {
				title: 'Car health',
				tKey: 'pagesNames.live.carTab',
				path: '/car',
				Component: CarHealth,
			},
			timing: {
				title: 'Timing & delta',
				tKey: 'pagesNames.live.timingTab',
				path: '/timing',
				Component: Timing,
			},
		},
	},
};
