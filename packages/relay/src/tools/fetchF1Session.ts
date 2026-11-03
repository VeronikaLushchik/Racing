/** @format */

import path from 'path';

import { OpenF1Client } from '../sources/openf1/openf1Client';

/**
 * Downloads one driver's race from OpenF1 into the local cache so it replays offline.
 * Usage: npm run f1:fetch -w @racing/relay -- --session 9590 --driver 1
 *        npm run f1:fetch -w @racing/relay -- --year 2024   (lists races)
 */
const arg = (name: string): string | undefined => {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async (): Promise<void> => {
	const client = new OpenF1Client(path.resolve(__dirname, '..', '..', '..', '..', 'data'));
	const year = arg('year');
	if (year) {
		const sessions = await client.get<{
			session_key: number;
			country_name: string;
			date_start: string;
		}>('sessions', { year, session_name: 'Race' });
		sessions.forEach(s =>
			process.stdout.write(
				`${s.session_key}\t${s.date_start.slice(0, 10)}\t${s.country_name}\n`,
			),
		);
		return;
	}
	const session = Number(arg('session'));
	const driver = Number(arg('driver'));
	if (!session || !driver)
		throw new Error('Pass --session <key> --driver <number>, or --year <yyyy>');
	const bundle = await client.loadBundle(session, driver);
	process.stdout.write(
		`Cached ${bundle.session.country_name} ${bundle.session.year}: ${bundle.carData.length} car samples, ` +
			`${bundle.laps.length} laps\n`,
	);
};

main().catch(error => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
