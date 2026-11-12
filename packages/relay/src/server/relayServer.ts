import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import { TClientMessage, TServerMessage } from '@racing/shared';

import { listRecordings } from '../pipeline/recorder';
import { importFiles } from '../sources/fileImport/fileImport';
import { ImportError } from '../sources/fileImport/importTypings';
import { OpenF1Client } from '../sources/openf1/openf1Client';
import { parseMultipart, readBody } from './multipartBody';
import { RelayHub } from './relayHub';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
	res.writeHead(status, {
		'Content-Type': 'application/json',
		...CORS_HEADERS,
	});
	res.end(JSON.stringify(body));
};

export const startRelayServer = (port: number, dataDir: string): http.Server => {
	const f1Client = new OpenF1Client(dataDir);
	const clients = new Set<WebSocket>();
	const broadcast = (message: TServerMessage): void => {
		const payload = JSON.stringify(message);
		clients.forEach(client => {
			// Drop frames for slow clients instead of queueing them up.
			if (message.type === 'frame' && client.bufferedAmount > 256 * 1024) return;
			if (client.readyState === WebSocket.OPEN) client.send(payload);
		});
	};
	const hub = new RelayHub(broadcast, dataDir, f1Client);

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		try {
			if (req.method === 'OPTIONS') {
				res.writeHead(204, CORS_HEADERS);
				return res.end();
			}
			if (url.pathname === '/api/imports' && req.method === 'POST') {
				const body = await readBody(req);
				const files = parseMultipart(body, req.headers['content-type'] ?? '');
				return sendJson(res, 200, importFiles(dataDir, files));
			}
			if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });
			if (url.pathname === '/api/recordings')
				return sendJson(res, 200, listRecordings(dataDir));
			if (url.pathname === '/api/f1/sessions') {
				const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());
				const rows = await f1Client.get('sessions', { year, session_name: 'Race' });
				return sendJson(res, 200, rows);
			}
			if (url.pathname === '/api/f1/drivers') {
				const sessionKey = Number(url.searchParams.get('session_key'));
				const rows = await f1Client.get('drivers', { session_key: sessionKey });
				return sendJson(res, 200, rows);
			}
			return sendJson(res, 404, { messageKey: 'notFound' });
		} catch (error) {
			if (error instanceof ImportError) {
				const status = error.messageKey === 'importTooLarge' ? 413 : 400;
				return sendJson(res, status, { messageKey: error.messageKey });
			}
			const message = error instanceof Error ? error.message : String(error);
			return sendJson(res, 502, { messageKey: 'upstreamError', message });
		}
	});

	const wss = new WebSocketServer({ server, path: '/ws' });
	wss.on('connection', socket => {
		clients.add(socket);
		hub.welcome().forEach(message => socket.send(JSON.stringify(message)));
		socket.on('message', raw => {
			try {
				const message = JSON.parse(String(raw)) as TClientMessage;
				hub.handleClientMessage(message).catch(error => {
					broadcast({
						type: 'status',
						state: 'error',
						source: null,
						message: String(error),
					});
				});
			} catch {
				// Ignore malformed client messages.
			}
		});
		socket.on('close', () => clients.delete(socket));
	});

	server.listen(port);
	return server;
};
