/** @format */

import React, { FC, ReactNode } from 'react';
import { QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';

import TranslationsProvider from '~@engines/translations/TranslationsProvider';

import { queryClient } from './queryClient';

interface RequiredProvidersProps {
	children: ReactNode;
}

const RequiredProviders: FC<RequiredProvidersProps> = props => {
	const { children } = props;

	return (
		<QueryClientProvider client={queryClient}>
			<TranslationsProvider>
				<BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>
			</TranslationsProvider>
		</QueryClientProvider>
	);
};

export default RequiredProviders;
