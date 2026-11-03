import type { TFieldEntry } from '@racing/shared';

export const DEFAULT_PIT_LOSS_S = 22;
/** A rejoin counts as clear air when both neighbours are at least this far away, s. */
export const CLEAR_AIR_S = 1.5;
/** Time lost on the out-lap while new tyres come up to temperature, s. */
export const WARM_UP_LOSS_S = 1;

export interface TRejoinNeighbour {
	entry: TFieldEntry;
	/** Positive gap to this car after the stop, s. */
	gapS: number;
}

export interface TRejoin {
	/** Gap to the leader right after the stop, s. */
	gapToLeaderS: number;
	position: number;
	ahead: TRejoinNeighbour | null;
	behind: TRejoinNeighbour | null;
	isClearAir: boolean;
}

export interface TUndercut {
	/** Time gained by stopping now instead of in `laps` laps, s (negative: stopping now loses). */
	gainS: number;
	laps: number;
}

export interface TUndercutTarget {
	entry: TFieldEntry;
	/** How far the car is ahead now, s. */
	intervalS: number;
	/** Laps the rival must stay out for the undercut to work; null when it never does. */
	lapsNeeded: number | null;
}

const gapOf = (entry: TFieldEntry): number => entry.gapToLeaderS ?? 0;

/** Field sorted by gap to the leader, the leader first. */
const byGap = (field: TFieldEntry[]): TFieldEntry[] =>
	[...field].sort((a, b) => gapOf(a) - gapOf(b) || a.position - b.position);

/**
 * Where the player comes out if they stop now: their gap to the leader grows by the pit loss
 * while everyone else keeps their gap (nobody else stops). Lapped traffic is ignored.
 */
export const predictRejoin = (field: TFieldEntry[], pitLossS: number): TRejoin | null => {
	const player = field.find(entry => entry.isPlayer);
	if (!player) {
		return null;
	}
	const gapToLeaderS = gapOf(player) + pitLossS;
	const others = byGap(field.filter(entry => !entry.isPlayer));
	const aheadList = others.filter(entry => gapOf(entry) <= gapToLeaderS);
	const behindList = others.filter(entry => gapOf(entry) > gapToLeaderS);
	const aheadEntry = aheadList[aheadList.length - 1] ?? null;
	const behindEntry = behindList[0] ?? null;
	const ahead = aheadEntry ? { entry: aheadEntry, gapS: gapToLeaderS - gapOf(aheadEntry) } : null;
	const behind = behindEntry
		? { entry: behindEntry, gapS: gapOf(behindEntry) - gapToLeaderS }
		: null;
	return {
		gapToLeaderS,
		position: aheadList.length + 1,
		ahead,
		behind,
		isClearAir:
			(!ahead || ahead.gapS >= CLEAR_AIR_S) && (!behind || behind.gapS >= CLEAR_AIR_S),
	};
};

/**
 * Stopping now instead of `laps` laps later: for each of those laps the old tyres are
 * `tyreAge` laps older than the new ones, so each lap is `degradationS · tyreAge` slower;
 * the new tyres pay a one-off warm-up loss.
 */
export const undercutGain = (
	degradationS: number,
	tyreAge: number,
	laps: number,
	warmUpLossS = WARM_UP_LOSS_S,
): TUndercut => ({
	gainS: laps * degradationS * tyreAge - warmUpLossS,
	laps,
});

/** The car directly ahead now, and how long it must stay out for an undercut to pass it. */
export const undercutTarget = (
	field: TFieldEntry[],
	degradationS: number,
	tyreAge: number,
	warmUpLossS = WARM_UP_LOSS_S,
): TUndercutTarget | null => {
	const sorted = byGap(field);
	const index = sorted.findIndex(entry => entry.isPlayer);
	if (index <= 0) {
		return null;
	}
	const entry = sorted[index - 1];
	const intervalS = gapOf(sorted[index]) - gapOf(entry);
	const perLap = degradationS * tyreAge;
	return {
		entry,
		intervalS,
		lapsNeeded: perLap > 0 ? Math.ceil((intervalS + warmUpLossS) / perLap) : null,
	};
};
