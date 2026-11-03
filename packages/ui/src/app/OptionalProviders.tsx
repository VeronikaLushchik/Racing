import React, { FC, ReactNode } from 'react';

import TelemetryProvider from 'src/modules/telemetry/TelemetryProvider';

interface OptionalProvidersProps {
	children: ReactNode;
}

const OptionalProviders: FC<OptionalProvidersProps> = props => {
	const { children } = props;

	return <TelemetryProvider>{children}</TelemetryProvider>;
};

export default OptionalProviders;
