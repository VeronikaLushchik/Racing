/** @format */

import { RELAY_DEFAULT_PORT } from '@racing/shared';

const defaultRelay = `http://${window.location.hostname || 'localhost'}:${RELAY_DEFAULT_PORT}`;

/** Relay base URL. Override with VITE_RELAY_URL (e.g. when the relay runs on the gaming PC). */
export const API_URL: string = import.meta.env.VITE_RELAY_URL ?? defaultRelay;
export const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;
