/** @format */

import path from 'path';

import { RELAY_DEFAULT_PORT } from '@racing/shared';

import { startRelayServer } from './server/relayServer';

const argValue = (name: string): string | undefined => {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
};

const port = Number(argValue('port') ?? process.env.RELAY_PORT ?? RELAY_DEFAULT_PORT);
const dataDir = path.resolve(argValue('data') ?? path.join(__dirname, '..', '..', '..', 'data'));

startRelayServer(port, dataDir);
process.stdout.write(`Relay listening on http://localhost:${port} (ws: /ws), data in ${dataDir}\n`);
