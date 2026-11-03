import { useSyncExternalStore } from 'react';

import { mergeOutline, TTrackOutline } from '~@engines/racingMath/trackOutlineModel';
import { safeStorage } from 'src/services/functions';

const STORAGE_KEY = 'racing.trackLibrary';
const MAX_TRACKS = 30;

type TListener = () => void;

const load = (): TTrackOutline[] => {
	try {
		const parsed = JSON.parse(safeStorage.get(STORAGE_KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

/** Track outlines saved in this browser, shared by every page that draws a mini map. */
class TrackLibrary {
	private outlines: TTrackOutline[] = load();
	private readonly listeners = new Set<TListener>();

	getAll = (): TTrackOutline[] => this.outlines;

	subscribe = (listener: TListener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	add(outline: TTrackOutline): void {
		const next = mergeOutline(this.outlines, outline);
		if (next !== this.outlines) {
			this.update(next.slice(-MAX_TRACKS));
		}
	}

	rename(id: string, name: string): void {
		const trimmed = name.trim();
		if (!trimmed) {
			return;
		}
		this.update(
			this.outlines.map(outline =>
				outline.id === id ? { ...outline, name: trimmed } : outline,
			),
		);
	}

	remove(id: string): void {
		this.update(this.outlines.filter(outline => outline.id !== id));
	}

	private update(outlines: TTrackOutline[]): void {
		this.outlines = outlines;
		safeStorage.set(STORAGE_KEY, JSON.stringify(outlines));
		this.listeners.forEach(listener => listener());
	}
}

export const trackLibrary = new TrackLibrary();

export const useTrackLibrary = (): TTrackOutline[] =>
	useSyncExternalStore(trackLibrary.subscribe, trackLibrary.getAll);
