import React, { FC, useCallback, useMemo, useState } from 'react';

import { safeStorage } from '../../services/functions';
import { buildTranslationFunction } from './translationsFunctions';

import translationsContext, { TTranslationsContext } from './translationsContext';

import { LANGUAGE_STORAGE_KEY } from '../../constants/commonConstants';

import { TLanguage, TTranslationDictionary } from './translationsTypings';

import en from 'src/translations/en.xml';
import uk from 'src/translations/uk.xml';

const DICTIONARIES: Record<TLanguage, TTranslationDictionary> = { en, uk };

const getInitialLanguage = (): TLanguage => {
	const stored = safeStorage.get(LANGUAGE_STORAGE_KEY);
	if (stored === 'en' || stored === 'uk') {
		return stored;
	}
	return navigator.language.startsWith('uk') ? 'uk' : 'en';
};

interface TranslationsProviderProps {
	children: React.ReactNode;
}

const TranslationsProvider: FC<TranslationsProviderProps> = props => {
	const { children } = props;

	const [language, setLanguageState] = useState<TLanguage>(getInitialLanguage);

	const t = useMemo(() => buildTranslationFunction(DICTIONARIES[language], en), [language]);

	const setLanguage = useCallback(
		(nextLanguage: TLanguage) => {
			safeStorage.set(LANGUAGE_STORAGE_KEY, nextLanguage);
			document.documentElement.lang = nextLanguage;
			setLanguageState(nextLanguage);
		},
		[setLanguageState],
	);

	const value = useMemo<TTranslationsContext>(
		() => ({ language, setLanguage, t }),
		[language, setLanguage, t],
	);

	return <translationsContext.Provider value={value}>{children}</translationsContext.Provider>;
};

export default TranslationsProvider;
