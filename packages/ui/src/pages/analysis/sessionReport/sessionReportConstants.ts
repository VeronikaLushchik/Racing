import { TDrivingFindingId } from '~@engines/racingMath/sessionReportModel';

export const FINDING_KEYS: Record<TDrivingFindingId, TTranslationKey> = {
	coasting: 'report.finding.coasting',
	overlap: 'report.finding.overlap',
	lapSpread: 'report.finding.lapSpread',
	brakeSpread: 'report.finding.brakeSpread',
	apexSpread: 'report.finding.apexSpread',
	improving: 'report.finding.improving',
	fading: 'report.finding.fading',
	trackLimits: 'report.finding.trackLimits',
	trailStraight: 'report.finding.trailStraight',
	trailAbrupt: 'report.finding.trailAbrupt',
	trailOver: 'report.finding.trailOver',
};

/** Pedal shares shown in the driving panel, in display order. */
export const PEDAL_ROWS = [
	{ key: 'fullThrottle', tKey: 'report.pedal.fullThrottle' },
	{ key: 'braking', tKey: 'report.pedal.braking' },
	{ key: 'coasting', tKey: 'report.pedal.coasting' },
	{ key: 'overlap', tKey: 'report.pedal.overlap' },
] as const;
