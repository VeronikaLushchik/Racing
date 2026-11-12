import { TTrailVerdict } from '~@engines/racingMath/trailBrakingModel';

export const TRAIL_VERDICT_KEYS: Record<TTrailVerdict, TTranslationKey> = {
	straightLine: 'trail.verdict.straightLine',
	abruptRelease: 'trail.verdict.abruptRelease',
	overTrail: 'trail.verdict.overTrail',
	good: 'trail.verdict.good',
};
