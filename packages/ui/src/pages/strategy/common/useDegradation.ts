import { useMemo } from 'react';

import { modelDegradation, TDegradationResult } from '~@engines/racingMath/tyreDegradationModel';
import { useCarProfile } from 'src/modules/carProfile/carProfile';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';

import { FORECAST_LAPS, WEAR_LIMIT } from './strategyConstants';

/** Degradation model of the current stint, recomputed when a lap is completed. */
const useDegradation = (): TDegradationResult | null => {
	const { lapRecords } = useTelemetryMeta();
	const profile = useCarProfile();
	return useMemo(
		() =>
			modelDegradation(lapRecords, {
				horizon: FORECAST_LAPS,
				temperatureWindow: profile.tyreWindowC,
				wearLimit: WEAR_LIMIT,
				fuelEffect: profile.fuelEffectSPerL,
			}),
		[lapRecords, profile],
	);
};

export default useDegradation;
