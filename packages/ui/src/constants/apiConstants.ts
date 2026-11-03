/** @format */

import { API_URL } from './serverAddress';

export const appUrl = (path: string): string => path;

export const API_PATHS = {
	recordings: `${API_URL}/api/recordings`,
	f1Sessions: `${API_URL}/api/f1/sessions`,
	f1Drivers: `${API_URL}/api/f1/drivers`,
};
