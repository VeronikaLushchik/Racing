import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { parseTranslationsXml } = createRequire(import.meta.url)('./scripts/translationsXml.cjs');

/** Imports translations/*.xml as a flat { key: text } dictionary. */
const translationsXml = (): Plugin => ({
	name: 'racing-translations-xml',
	load(id) {
		if (!id.endsWith('.xml')) {
			return null;
		}
		const dictionary = parseTranslationsXml(fs.readFileSync(id, 'utf8'));
		return `export default ${JSON.stringify(dictionary)};`;
	},
});

export default defineConfig({
	plugins: [react(), translationsXml()],
	base: process.env.UI_BASE ?? '/',
	resolve: {
		alias: {
			'~@ui': path.resolve(__dirname, 'src/ui'),
			'~@components': path.resolve(__dirname, 'src/components'),
			'~@engines': path.resolve(__dirname, 'src/engines'),
			src: path.resolve(__dirname, 'src'),
			'@racing/shared': path.resolve(__dirname, '../shared/src/index.ts'),
		},
	},
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler',
				loadPaths: [__dirname],
				silenceDeprecations: ['import'],
			},
		},
	},
	server: { port: 5173, host: true },
});
