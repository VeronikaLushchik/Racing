/** @format */

import { ComponentType } from 'react';

import { TTranslationKey } from '~@engines/translations/translationsTypings';

export interface TPageTab {
	title: string;
	tKey: TTranslationKey;
	path: string;
	Component: ComponentType;
}

export interface TPage {
	path: string;
	title: string;
	tKey: TTranslationKey;
	Component?: ComponentType;
	tabs?: Record<string, TPageTab>;
}

export type TPagesConfig = Record<string, TPage>;
