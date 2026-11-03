/** @format */

import React, { FC, ReactNode, useCallback, useMemo, useState } from 'react';

import { safeStorage } from 'src/services/functions';

import { TranslationsContext } from './translationsContext';

import { LANGUAGE_STORAGE_KEY } from 'src/constants/commonConstants';
import en from 'src/translations/en.json';
import uk from 'src/translations/uk.json';

import { TLanguage, TTranslationKey } from './translationsTypings';

const DICTIONARIES: Record<TLanguage, unknown> = { en, uk };

const lookup = (dictionary: unknown, key: string): string | null => {
	const value = key
		.split('.')
		.reduce<unknown>(
			(node, part) =>
				node && typeof node === 'object'
					? (node as Record<string, unknown>)[part]
					: undefined,
			dictionary,
		);
	return typeof value === 'string' ? value : null;
};

const initialLanguage = (): TLanguage => {
	const stored = safeStorage.get(LANGUAGE_STORAGE_KEY);
	if (stored === 'en' || stored === 'uk') return stored;
	return navigator.language.startsWith('uk') ? 'uk' : 'en';
};

interface TranslationsProviderProps {
	children: ReactNode;
}

const TranslationsProvider: FC<TranslationsProviderProps> = props => {
	const { children } = props;

	const [language, setLanguageState] = useState<TLanguage>(initialLanguage);

	const t = useCallback(
		(key: TTranslationKey) => lookup(DICTIONARIES[language], key) ?? lookup(en, key) ?? key,
		[language],
	);

	const setLanguage = useCallback((next: TLanguage) => {
		safeStorage.set(LANGUAGE_STORAGE_KEY, next);
		document.documentElement.lang = next;
		setLanguageState(next);
	}, []);

	const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

	return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>;
};

export default TranslationsProvider;
