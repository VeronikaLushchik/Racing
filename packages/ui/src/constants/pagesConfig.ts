import GhostLap from 'src/pages/analysis/ghostLap/GhostLap';
import TrackMap from 'src/pages/analysis/trackMap/TrackMap';
import CarHealth from 'src/pages/live/carHealth/CarHealth';
import DriverTelemetry from 'src/pages/live/driverTelemetry/DriverTelemetry';
import Timing from 'src/pages/live/timing/Timing';
import PitWindow from 'src/pages/strategy/pitWindow/PitWindow';
import TyreDegradation from 'src/pages/strategy/tyreDegradation/TyreDegradation';
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
	analysis: {
		path: '/analysis',
		title: 'Analysis',
		tKey: 'pagesNames.analysis.analysis',
		tabs: {
			ghostLap: {
				title: 'Ghost lap',
				tKey: 'pagesNames.analysis.ghostTab',
				path: '/ghost-lap',
				Component: GhostLap,
			},
			trackMap: {
				title: 'Track map',
				tKey: 'pagesNames.analysis.trackMapTab',
				path: '/track-map',
				Component: TrackMap,
			},
		},
	},
	strategy: {
		path: '/strategy',
		title: 'Strategy',
		tKey: 'pagesNames.strategy.strategy',
		tabs: {
			tyreDegradation: {
				title: 'Tyre degradation',
				tKey: 'pagesNames.strategy.degradationTab',
				path: '/tyre-degradation',
				Component: TyreDegradation,
			},
			pitWindow: {
				title: 'Pit window',
				tKey: 'pagesNames.strategy.pitTab',
				path: '/pit-window',
				Component: PitWindow,
			},
		},
	},
};
