/** @format */

import { TTranslationKey } from './translationsTypings';

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

/** Looks a key up in the active dictionary, then in the fallback one, then returns the key. */
export const buildTranslationFunction =
	(dictionary: unknown, fallbackDictionary: unknown) =>
	(tKey: TTranslationKey): string =>
		lookup(dictionary, tKey) ?? lookup(fallbackDictionary, tKey) ?? tKey;
