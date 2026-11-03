// TTranslationKey is global, generated into src/translations.d.ts from translations/en.xml.

export type TLanguage = 'en' | 'uk';
export type TTranslationDictionary = Record<string, string>;
export type TTranslationFunction = (tKey: TTranslationKey, ...args: (string | number)[]) => string;
