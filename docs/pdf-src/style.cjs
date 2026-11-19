// Shared look of the chapters added to docs/race-telemetry-uk.pdf: the same fonts, sizes and
// colours as the original 25 pages, and helpers for formulas (KaTeX) and screenshots.
const fs = require('fs');
const path = require('path');
const katex = require('katex');

const SCREENSHOTS = path.resolve(__dirname, '../screenshots');

/** Inline formula. */
const m = tex => katex.renderToString(tex, { displayMode: false, throwOnError: true });
/** Display formula in the blue-edged box. */
const F = tex =>
	`<div class="formula">${katex.renderToString(tex, { displayMode: true, throwOnError: true })}</div>`;
/** Screenshot from docs/screenshots with a caption. */
const img = (file, caption) =>
	`<figure><img src="data:image/png;base64,${fs
		.readFileSync(path.join(SCREENSHOTS, file))
		.toString('base64')}"/><figcaption>${caption}</figcaption></figure>`;

const CSS = `
@page { size: A4; margin: 48pt 48pt 40pt 48pt; }
body { font-family: 'DejaVu Sans'; font-size: 10pt; line-height: 1.5; color: #1b1f24; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 12pt; padding-bottom: 6pt; border-bottom: 1.5pt solid #2f6fde; }
h2 { font-size: 11.5pt; margin: 16pt 0 6pt; }
h3 { font-size: 10pt; margin: 12pt 0 4pt; }
p { margin: 0 0 7pt; }
.formula { background: #f3f6fa; border-left: 3pt solid #2f6fde; padding: 6pt 12pt; margin: 6pt 0 9pt; break-inside: avoid; overflow: hidden; }
.formula .katex-display { margin: 0; }
.katex { font-size: 1.21em; }
.note { font-size: 8.5pt; color: #3a4048; }
figure { margin: 8pt 0 10pt; break-inside: avoid; }
figure img { width: 100%; border-radius: 4pt; }
figcaption { font-size: 8.5pt; color: #5a6068; margin-top: 4pt; }
.conclusions { border: 1pt solid #d9dee5; border-radius: 4pt; padding: 8pt 12pt; margin-top: 12pt; break-inside: avoid; background: #fafbfc; }
.conclusions_title { color: #1f8a4c; font-weight: bold; margin-bottom: 4pt; }
.conclusions ul { margin: 0; padding-left: 14pt; }
`;

/** Full HTML page for one chapter, with KaTeX styles and fonts from node_modules. */
const page = body => {
	const katexCss = require.resolve('katex/dist/katex.min.css');
	const fonts = `file://${path.dirname(katexCss)}/fonts/`;
	return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>${fs
		.readFileSync(katexCss, 'utf8')
		.replace(/url\(fonts\//g, `url(${fonts}`)}${CSS}</style></head><body>${body}</body></html>`;
};

module.exports = { m, F, img, page };
