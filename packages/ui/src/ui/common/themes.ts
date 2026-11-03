export type TColorScheme = Record<string, string>;

/** Dark scheme. Each key becomes a CSS variable on <html> (see RootThemeProvider). */
export const darkTheme: TColorScheme = {
	'--surface-primary': '#161b22',
	'--surface-secondary': '#0e1116',
	'--surface-raised': '#1f2630',

	'--stroke-primary': '#2c3440',
	'--stroke-active': '#3d8bfd',

	'--text-primary': '#e6edf3',
	'--text-secondary': '#8b98a5',
	'--text-disabled': '#5b6673',
	'--text-active': '#3d8bfd',

	'--button-primary': '#3d8bfd',
	'--button-stroke': '#2c3440',
	'--button-system': '#1f2630',
	'--button-hovered': '#5d9efd',
	'--button-disabled': '#26303b',
	'--button-label-primary': '#0b0e13',

	'--input-bg': '#0e1116',

	'--system-dangerous': '#ef4b4b',
	'--system-warning': '#e6c229',
	'--system-success': '#2fbf71',

	'--chart-grid': '#26303b',
	'--chart-speed': '#3d8bfd',
	'--chart-throttle': '#2fbf71',
	'--chart-brake': '#ef4b4b',
	'--chart-gear': '#c7a4ff',
	'--chart-rpm': '#f2a93b',

	'--sector-purple': '#a55cff',
	'--sector-green': '#2fbf71',
	'--sector-yellow': '#e6c229',

	'--temperature-cold': '#3d8bfd',
	'--temperature-optimal': '#2fbf71',
	'--temperature-hot': '#ef4b4b',
};
