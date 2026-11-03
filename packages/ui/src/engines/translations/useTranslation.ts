/** @format */

import { useContext } from 'react';

import { TranslationsContext } from './translationsContext';

const useTranslation = () => useContext(TranslationsContext).t;

export const useLanguage = () => {
	const { language, setLanguage } = useContext(TranslationsContext);
	return { language, setLanguage };
};

export default useTranslation;
