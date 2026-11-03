import React, { FC, useLayoutEffect, useMemo } from 'react';

import themeContext, { TThemeContext } from '../common/themeContext';
import { darkTheme } from '../common/themes';

interface RootThemeProviderProps {
	children: React.ReactNode;
}

const RootThemeProvider: FC<RootThemeProviderProps> = props => {
	const { children } = props;

	const value = useMemo<TThemeContext>(() => ({ themeName: 'dark', theme: darkTheme }), []);

	useLayoutEffect(() => {
		const root = document.documentElement;
		Object.entries(value.theme).forEach(([name, color]) => root.style.setProperty(name, color));
		root.dataset.theme = value.themeName;
	}, [value]);

	return <themeContext.Provider value={value}>{children}</themeContext.Provider>;
};

export default RootThemeProvider;
