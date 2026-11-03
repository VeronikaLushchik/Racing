/** @format */

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
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
	css: { preprocessorOptions: { scss: { api: 'modern-compiler', loadPaths: [__dirname] } } },
	server: { port: 5173, host: true },
});
