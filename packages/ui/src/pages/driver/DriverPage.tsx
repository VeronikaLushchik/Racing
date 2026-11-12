import React, { FC } from 'react';

import PageContent from '~@ui/PageContent/PageContent';
import DriverTelemetry from 'src/pages/live/driverTelemetry/DriverTelemetry';

/** For the driver: what the car is doing right now, on one screen without scrolling. */
const DriverPage: FC = () => (
	<PageContent>
		<DriverTelemetry />
	</PageContent>
);

export default DriverPage;
