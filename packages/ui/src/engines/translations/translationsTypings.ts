/** @format */

import en from 'src/translations/en.json';

type TJoin<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;

type TLeafKeys<T> = {
	[K in keyof T]: T[K] extends Record<string, unknown> ? TJoin<K, TLeafKeys<T[K]>> : K;
}[keyof T];

export type TTranslationKey = TLeafKeys<typeof en>;
export type TLanguage = 'en' | 'uk';
export type TTranslationFunction = (tKey: TTranslationKey) => string;
