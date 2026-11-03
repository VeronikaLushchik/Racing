import React, { FC, ReactNode } from 'react';

import TelemetryProvider from 'src/modules/telemetry/TelemetryProvider';
import TrackLibrarySync from 'src/modules/trackLibrary/TrackLibrarySync';

interface OptionalProvidersProps {
	children: ReactNode;
}

const OptionalProviders: FC<OptionalProvidersProps> = props => {
	const { children } = props;

	return (
		<TelemetryProvider>
			<TrackLibrarySync />
			{children}
		</TelemetryProvider>
	);
};

export default OptionalProviders;
