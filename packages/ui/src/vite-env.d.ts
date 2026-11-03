/// <reference types="vite/client" />

declare module '*.module.scss' {
	const classes: Record<string, string>;
	export default classes;
}

declare module '*.xml' {
	const dictionary: Record<string, string>;
	export default dictionary;
}
