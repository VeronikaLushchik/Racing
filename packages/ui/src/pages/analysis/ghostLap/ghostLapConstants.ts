import { TCornerInsightKind } from '~@engines/racingMath/ghostLapModel';

export const INSIGHT_KEYS: Record<TCornerInsightKind, TTranslationKey> = {
	lateBrakeSlowExit: 'ghost.insight.lateBrakeSlowExit',
	earlyBrakeFastExit: 'ghost.insight.earlyBrakeFastExit',
	lateBrake: 'ghost.insight.lateBrake',
	earlyBrake: 'ghost.insight.earlyBrake',
	moreApexSpeed: 'ghost.insight.moreApexSpeed',
	lessApexSpeed: 'ghost.insight.lessApexSpeed',
	lateThrottle: 'ghost.insight.lateThrottle',
	earlyThrottle: 'ghost.insight.earlyThrottle',
	slowerSameInputs: 'ghost.insight.slowerSameInputs',
	fasterSameInputs: 'ghost.insight.fasterSameInputs',
	similar: 'ghost.insight.similar',
};

/** Corner time differences smaller than this are shown as neutral, s. */
export const NEUTRAL_TIME_S = 0.02;
