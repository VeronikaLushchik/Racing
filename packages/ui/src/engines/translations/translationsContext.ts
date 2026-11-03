import { createContext } from 'react';

import { emptyFunction } from '../../services/functions';
import { buildTranslationFunction } from './translationsFunctions';

import { TLanguage, TTranslationFunction } from './translationsTypings';

export interface TTranslationsContext {
	language: TLanguage;
	setLanguage: (language: TLanguage) => void;
	t: TTranslationFunction;
}

export default createContext<TTranslationsContext>({
	language: 'en',
	setLanguage: emptyFunction,
	t: buildTranslationFunction({}, {}),
});
