import { useMemo } from 'react';

import { modelDegradation, TDegradationResult } from '~@engines/racingMath/tyreDegradationModel';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';

import { TYRE_WINDOW_C } from 'src/pages/live/carHealth/carHealthConstants';
import { FORECAST_LAPS, WEAR_LIMIT } from './strategyConstants';

/** Degradation model of the current stint, recomputed when a lap is completed. */
const useDegradation = (): TDegradationResult | null => {
	const { lapRecords } = useTelemetryMeta();
	return useMemo(
		() =>
			modelDegradation(lapRecords, {
				horizon: FORECAST_LAPS,
				temperatureWindow: TYRE_WINDOW_C,
				wearLimit: WEAR_LIMIT,
			}),
		[lapRecords],
	);
};

export default useDegradation;
