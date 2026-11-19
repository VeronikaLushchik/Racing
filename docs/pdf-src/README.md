# Source of `docs/race-telemetry-uk.pdf`

- `base.pdf` — the original 25 pages (chapters 1–20), frozen. Edit them only by regenerating this file.
- `chapters/NN-name.cjs` — chapters added later. Each exports `{ tocTitle, html }`; `html` uses the
  helpers from `style.cjs`: `F(tex)` for a formula box, `m(tex)` for an inline formula,
  `img(file, caption)` for a screenshot from `docs/screenshots/`.
- `build.cjs` — prints every chapter with Playwright (A4, same fonts and colours as the base) and runs
  `merge.py`, which appends them in file name order, adds their titles to the table of contents on
  page 2 and renumbers every footer.

```bash
npm install --no-save katex@0.16.11
node docs/pdf-src/build.cjs
```

Needs Playwright with Chromium, Python 3 with `pypdf` and `reportlab`, and the DejaVu Sans font.
