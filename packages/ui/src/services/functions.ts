export const emptyFunction = (): void => undefined;

export const compositeClassNames = (...names: (string | false | null | undefined)[]): string =>
	names.filter(Boolean).join(' ');

/** Tagged template for URLs with a query string: qs`${url}`.query({ a: 1 }). */
export const qs = (strings: TemplateStringsArray, ...values: unknown[]) => {
	const base = strings.reduce(
		(acc, part, i) => acc + part + (i < values.length ? String(values[i]) : ''),
		'',
	);
	return {
		query: (params: Record<string, string | number | undefined | null>): string => {
			const search = new URLSearchParams();
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null && value !== '')
					search.set(key, String(value));
			});
			const text = search.toString();
			return text ? `${base}?${text}` : base;
		},
	};
};

export const formatLapTime = (ms: number | null | undefined): string => {
	if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return '—';
	const minutes = Math.floor(ms / 60000);
	const seconds = (ms % 60000) / 1000;
	return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
};

export const formatDelta = (seconds: number | null): string => {
	if (seconds === null || !Number.isFinite(seconds)) return '—';
	return `${seconds >= 0 ? '+' : '−'}${Math.abs(seconds).toFixed(2)}`;
};

export const safeStorage = {
	get: (key: string): string | null => {
		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set: (key: string, value: string): void => {
		try {
			window.localStorage.setItem(key, value);
		} catch {
			// Storage unavailable (private mode).
		}
	},
};
