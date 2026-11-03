/** @format */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseTranslationsXml, serializeTranslationsXml } = require('./translationsXml.cjs');
const { buildTranslationKeysFile, SOURCE, TARGET } = require('./generateTranslationKeys.cjs');

const read = language =>
	parseTranslationsXml(
		fs.readFileSync(path.join(__dirname, `../src/translations/${language}.xml`), 'utf8'),
	);

test('en.xml and uk.xml have the same keys and no empty values', () => {
	const en = read('en');
	const uk = read('uk');
	assert.deepEqual(Object.keys(uk).sort(), Object.keys(en).sort());
	for (const [key, value] of [...Object.entries(en), ...Object.entries(uk)]) {
		assert.ok(value.trim().length > 0, `empty translation for ${key}`);
	}
});

test('XML round trip keeps special characters', () => {
	const dictionary = { 'a.b': 'Tom & "Jerry" <3', 'c.d': 'Ш’який' };
	assert.deepEqual(parseTranslationsXml(serializeTranslationsXml(dictionary)), dictionary);
});

test('duplicate keys are rejected', () => {
	assert.throws(
		() => parseTranslationsXml('<entry key="x">1</entry><entry key="x">2</entry>'),
		/Duplicate translation key: x/,
	);
});

test('src/translations.d.ts is up to date with en.xml', () => {
	assert.equal(
		fs.readFileSync(TARGET, 'utf8'),
		buildTranslationKeysFile(fs.readFileSync(SOURCE, 'utf8')),
		'run npm run translations:keys -w @racing/ui',
	);
});
