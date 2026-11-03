import { createContext, useContext } from 'react';

import { TColorScheme, darkTheme } from './themes';

export type TThemeName = 'dark';

export interface TThemeContext {
	themeName: TThemeName;
	theme: TColorScheme;
}

const themeContext = createContext<TThemeContext>({
	themeName: 'dark',
	theme: darkTheme,
});

export const useTheme = (): TColorScheme => useContext(themeContext).theme;

export default themeContext;
