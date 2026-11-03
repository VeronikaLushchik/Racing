// Generates src/translations.d.ts (the global TTranslationKey union) from translations/en.xml.
// Run after adding or removing keys: npm run translations:keys -w @racing/ui

const fs = require('node:fs');
const path = require('node:path');

const { parseTranslationsXml } = require('./translationsXml.cjs');

const SOURCE = path.join(__dirname, '../src/translations/en.xml');
const TARGET = path.join(__dirname, '../src/translations.d.ts');

const buildTranslationKeysFile = xml => {
	const keys = Object.keys(parseTranslationsXml(xml)).sort();
	return [
		'// Generated from src/translations/en.xml by scripts/generateTranslationKeys.cjs. Do not edit.',
		'',
		'type TTranslationKey =',
		...keys.map((key, index) => `\t| '${key}'${index === keys.length - 1 ? ';' : ''}`),
		'',
	].join('\n');
};

if (require.main === module) {
	fs.writeFileSync(TARGET, buildTranslationKeysFile(fs.readFileSync(SOURCE, 'utf8')));
	process.stdout.write(`Wrote ${path.relative(process.cwd(), TARGET)}\n`);
}

module.exports = { buildTranslationKeysFile, SOURCE, TARGET };
