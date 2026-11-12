import { useSyncExternalStore } from 'react';

import { useTelemetryStore } from 'src/modules/telemetry/useTelemetry';
import { TSetupEvidence } from '~@engines/racingMath/setupAdvisorModel';

/** How often the evidence is re-read, Hz. */
const EVIDENCE_HZ = 1;

/** Setup evidence snapshot, re-read once a second and right after a reset. */
const useSetupEvidence = (): TSetupEvidence => {
	const store = useTelemetryStore();
	const collector = store.setupEvidence;
	return useSyncExternalStore(listener => {
		let seen = collector.version;
		const id = window.setInterval(() => {
			if (collector.version !== seen) {
				seen = collector.version;
				listener();
			}
		}, 1000 / EVIDENCE_HZ);
		return () => window.clearInterval(id);
	}, collector.summary);
};

export default useSetupEvidence;
