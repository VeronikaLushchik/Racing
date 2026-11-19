// Rebuilds docs/race-telemetry-uk.pdf: base.pdf (the original 25 pages) plus every chapter in
// chapters/, in file name order. Each chapter is HTML with server-rendered KaTeX, printed by
// Playwright; merge.py then appends them, lists them in the table of contents and renumbers
// every footer. Usage, from the repository root:
//   npm install --no-save katex@0.16.11 && node docs/pdf-src/build.cjs
// Needs Playwright with Chromium, Python 3 with pypdf and reportlab, and the DejaVu Sans font.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const { page: toPage } = require('./style.cjs');

const ROOT = __dirname;
const BUILD = path.join(ROOT, '.build');
const OUTPUT = path.resolve(ROOT, '../race-telemetry-uk.pdf');

(async () => {
	fs.mkdirSync(BUILD, { recursive: true });
	const files = fs
		.readdirSync(path.join(ROOT, 'chapters'))
		.filter(name => name.endsWith('.cjs'))
		.sort();
	const browser = await chromium.launch();
	const tab = await browser.newPage();
	const chapters = [];
	for (const file of files) {
		const { tocTitle, html } = require(path.join(ROOT, 'chapters', file));
		const htmlPath = path.join(BUILD, file.replace(/\.cjs$/, '.html'));
		const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
		fs.writeFileSync(htmlPath, toPage(html));
		await tab.goto(`file://${htmlPath}`);
		await tab.pdf({
			path: pdfPath,
			format: 'A4',
			printBackground: true,
			margin: { top: '64px', bottom: '53px', left: '64px', right: '64px' },
		});
		chapters.push({ pdf: pdfPath, title: tocTitle });
	}
	await browser.close();
	fs.writeFileSync(path.join(BUILD, 'chapters.json'), JSON.stringify(chapters));
	execFileSync(
		'python3',
		[path.join(ROOT, 'merge.py'), path.join(ROOT, 'base.pdf'), path.join(BUILD, 'chapters.json'), OUTPUT],
		{ stdio: 'inherit' },
	);
})();
