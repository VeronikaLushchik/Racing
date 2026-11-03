/** @format */

export class ServerStatusError extends Error {
	constructor(
		readonly status: number,
		readonly messageKey: string | null,
		message: string,
	) {
		super(message);
	}
}
