import AnalystPage from 'src/pages/analyst/AnalystPage';
import CarPage from 'src/pages/car/CarPage';
import DriverPage from 'src/pages/driver/DriverPage';
import SourcePage from 'src/pages/source/SourcePage';

import { TPagesConfig } from 'src/typings';

/**
 * Every page of the app. Routes are generated from here only. Pages are cut by who reads them
 * (driver, car, analyst) and stack their sections instead of hiding them in tabs.
 */
export const pagesConfig: TPagesConfig = {
	source: {
		path: '/source',
		title: 'Data source',
		tKey: 'pagesNames.source',
		Component: SourcePage,
	},
	driver: {
		path: '/driver',
		title: 'Driver',
		tKey: 'pagesNames.driver',
		Component: DriverPage,
	},
	car: {
		path: '/car',
		title: 'Car',
		tKey: 'pagesNames.car',
		Component: CarPage,
	},
	analyst: {
		path: '/analyst',
		title: 'Analyst',
		tKey: 'pagesNames.analyst',
		Component: AnalystPage,
	},
};
