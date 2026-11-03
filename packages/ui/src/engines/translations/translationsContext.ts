/** @format */

import { createContext } from 'react';

import { TLanguage, TTranslationKey } from './translationsTypings';

export interface TTranslationsContext {
	language: TLanguage;
	setLanguage: (language: TLanguage) => void;
	t: (key: TTranslationKey) => string;
}

export const TranslationsContext = createContext<TTranslationsContext>({
	language: 'en',
	setLanguage: () => undefined,
	t: key => key,
});
