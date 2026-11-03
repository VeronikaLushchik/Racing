import { TTranslationDictionary } from './translationsTypings';

const VARIABLES_REGEXP = /{(\d*)}/g;

/** Replaces {0}, {1} … (or bare {} in order) with the arguments. */
export const resolveVariables = (pattern: string, args: (string | number)[]): string => {
	let next = 0;
	return pattern.replace(VARIABLES_REGEXP, (match, index: string) => {
		const value = args[index === '' ? next++ : Number(index)];
		return value === undefined ? match : String(value);
	});
};

/** Looks a key up in the active dictionary, then in the fallback one, then returns the key. */
export const buildTranslationFunction =
	(dictionary: TTranslationDictionary, fallbackDictionary: TTranslationDictionary) =>
	(tKey: TTranslationKey, ...args: (string | number)[]): string => {
		const pattern = dictionary[tKey] ?? fallbackDictionary[tKey] ?? tKey;
		return args.length ? resolveVariables(pattern, args) : pattern;
	};
