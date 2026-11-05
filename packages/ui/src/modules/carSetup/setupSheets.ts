import { useSyncExternalStore } from 'react';

import { safeStorage } from 'src/services/functions';
import {
	SETUP_FIELDS,
	SETUP_FIELD_SPECS,
	TSetupValues,
} from '~@engines/racingMath/setupAdvisorModel';

const STORAGE_KEY = 'racing.setupSheets';

/** One car's setup as the driver copied it from the game. */
export interface TSetupSheet {
	id: string;
	name: string;
	values: TSetupValues;
	updatedAt: number;
}

interface TSetupState {
	sheets: TSetupSheet[];
	activeId: string | null;
}

type TListener = () => void;

const newId = (): string =>
	`setup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const cleanValues = (raw: unknown): TSetupValues => {
	const values: TSetupValues = {};
	if (!raw || typeof raw !== 'object') return values;
	SETUP_FIELDS.forEach(field => {
		const value = (raw as Record<string, unknown>)[field];
		const spec = SETUP_FIELD_SPECS[field];
		if (typeof value === 'number' && Number.isFinite(value)) {
			values[field] = Math.min(spec.max, Math.max(spec.min, value));
		}
	});
	return values;
};

/** Setup sheets saved in this browser, one per car, and which one is on the car now. */
class SetupSheetStore {
	private state: TSetupState = this.load();
	private readonly listeners = new Set<TListener>();

	get = (): TSetupState => this.state;

	subscribe = (listener: TListener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	create(name: string): void {
		const sheet: TSetupSheet = { id: newId(), name, values: {}, updatedAt: Date.now() };
		this.save({ sheets: [...this.state.sheets, sheet], activeId: sheet.id });
	}

	select(id: string): void {
		this.save({ ...this.state, activeId: id });
	}

	update(id: string, patch: Partial<Pick<TSetupSheet, 'name' | 'values'>>): void {
		this.save({
			...this.state,
			sheets: this.state.sheets.map(sheet =>
				sheet.id === id ? { ...sheet, ...patch, updatedAt: Date.now() } : sheet,
			),
		});
	}

	remove(id: string): void {
		const sheets = this.state.sheets.filter(sheet => sheet.id !== id);
		this.save({
			sheets,
			activeId: this.state.activeId === id ? (sheets[0]?.id ?? null) : this.state.activeId,
		});
	}

	private save(state: TSetupState): void {
		this.state = state;
		safeStorage.set(STORAGE_KEY, JSON.stringify(state));
		this.listeners.forEach(listener => listener());
	}

	private load(): TSetupState {
		try {
			const raw = JSON.parse(safeStorage.get(STORAGE_KEY) ?? 'null') as {
				sheets?: unknown;
				activeId?: unknown;
			} | null;
			const sheets = Array.isArray(raw?.sheets)
				? (raw?.sheets as Record<string, unknown>[])
						.filter(item => typeof item?.id === 'string')
						.map(item => ({
							id: item.id as string,
							name: typeof item.name === 'string' ? item.name : '—',
							values: cleanValues(item.values),
							updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
						}))
				: [];
			const activeId =
				typeof raw?.activeId === 'string' && sheets.some(s => s.id === raw.activeId)
					? raw.activeId
					: (sheets[0]?.id ?? null);
			return { sheets, activeId };
		} catch {
			return { sheets: [], activeId: null };
		}
	}
}

export const setupSheets = new SetupSheetStore();

export const useSetupSheets = (): TSetupState =>
	useSyncExternalStore(setupSheets.subscribe, setupSheets.get);

export const useActiveSetup = (): TSetupSheet | null => {
	const { sheets, activeId } = useSetupSheets();
	return sheets.find(sheet => sheet.id === activeId) ?? null;
};
