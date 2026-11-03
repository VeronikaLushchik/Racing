/** @format */

import React from 'react';
import ReactDOM from 'react-dom/client';

import RequiredProviders from './RequiredProviders';
import App from './app/App';

import './index.scss';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
	<React.StrictMode>
		<RequiredProviders>
			<App />
		</RequiredProviders>
	</React.StrictMode>,
);
