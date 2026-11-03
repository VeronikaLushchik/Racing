// Reads and writes translation dictionaries in the XML properties format:
// <properties><entry key="pagesNames.live.driverTab">Driver</entry></properties>
// Shared by the Vite loader, the key typings generator and the tests (no dependencies).

const ENTRY_REGEXP = /<entry\s+key="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/entry>)/g;

const decode = text =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');

const encode = text =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const parseTranslationsXml = xml => {
	const dictionary = {};
	for (const match of xml.matchAll(ENTRY_REGEXP)) {
		const key = decode(match[1]);
		if (key in dictionary) {
			throw new Error(`Duplicate translation key: ${key}`);
		}
		dictionary[key] = decode(match[2] ?? '');
	}
	return dictionary;
};

const serializeTranslationsXml = (dictionary, comment) => {
	const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<properties>'];
	if (comment) {
		lines.push(`\t<comment>${encode(comment)}</comment>`);
	}
	for (const [key, value] of Object.entries(dictionary)) {
		lines.push(`\t<entry key="${encode(key)}">${encode(value)}</entry>`);
	}
	lines.push('</properties>', '');
	return lines.join('\n');
};

module.exports = { parseTranslationsXml, serializeTranslationsXml };
