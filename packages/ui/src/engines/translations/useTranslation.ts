import { useContext } from 'react';

import translationsContext from './translationsContext';

const useTranslation = () => useContext(translationsContext).t;

export const useLanguage = () => {
	const { language, setLanguage } = useContext(translationsContext);
	return { language, setLanguage };
};

export default useTranslation;
