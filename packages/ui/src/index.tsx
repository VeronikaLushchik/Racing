/** @format */

import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/App';
import RequiredProviders from './RequiredProviders';

import './ui/common/global.scss';

createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<RequiredProviders>
			<App />
		</RequiredProviders>
	</React.StrictMode>,
);
