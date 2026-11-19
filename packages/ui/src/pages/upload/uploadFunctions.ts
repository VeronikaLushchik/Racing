export type TFileKind = 'session' | 'frames' | 'csv' | 'recording' | 'unknown';

/** What a picked file probably is, from its name; the relay decides by its content. */
export const fileKindOf = (name: string): TFileKind => {
	const lower = name.toLowerCase();
	if (/\.ndjson(\.gz)?$/.test(lower)) return 'recording';
	if (/\.(csv|tsv|txt)(\.gz)?$/.test(lower)) return 'csv';
	if (lower.endsWith('.json')) return 'session';
	if (lower.endsWith('.bin')) return 'frames';
	if (lower.endsWith('.gz')) return 'recording';
	return 'unknown';
};

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Files with the same name replace the earlier pick; order is kept. */
export const mergeFiles = (current: File[], added: File[]): File[] => {
	const names = new Set(added.map(file => file.name));
	return [...current.filter(file => !names.has(file.name)), ...added];
};

/** A short hint when the picked files cannot work together. */
export const pickProblem = (files: File[]): 'missingFrames' | 'missingSession' | null => {
	const kinds = files.map(file => fileKindOf(file.name));
	const hasOther = kinds.some(kind => kind === 'csv' || kind === 'recording');
	if (hasOther) return null;
	if (kinds.includes('session') && !kinds.includes('frames')) return 'missingFrames';
	if (kinds.includes('frames') && !kinds.includes('session')) return 'missingSession';
	return null;
};
