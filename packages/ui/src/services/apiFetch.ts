/** @format */

import { ServerStatusError } from './serverStatusError';

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(url, init);
	if (!response.ok) {
		let body: { messageKey?: string; message?: string } = {};
		try {
			body = await response.json();
		} catch {
			// Non-JSON error body.
		}
		throw new ServerStatusError(
			response.status,
			body.messageKey ?? null,
			body.message ?? response.statusText,
		);
	}
	return (await response.json()) as T;
};

export const apiFetch = { json };
