import { TTranslationDictionary } from './translationsTypings';

/** Looks a key up in the active dictionary, then in the fallback one, then returns the key. */
export const buildTranslationFunction =
	(dictionary: TTranslationDictionary, fallbackDictionary: TTranslationDictionary) =>
	(tKey: TTranslationKey): string =>
		dictionary[tKey] ?? fallbackDictionary[tKey] ?? tKey;
