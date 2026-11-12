/** Heat level of the time lost in a corner: 0 fastest of the session … 4 a big loss. */
export const lossLevel = (lossS: number): number => {
	if (lossS < 0.005) return 0;
	if (lossS < 0.1) return 1;
	if (lossS < 0.25) return 2;
	if (lossS < 0.5) return 3;
	return 4;
};
