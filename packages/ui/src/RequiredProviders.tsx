import React, { FC, ReactNode } from 'react';
import { QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';

import RootThemeProvider from './ui/RootThemeProvider/RootThemeProvider';
import TranslationsProvider from '~@engines/translations/TranslationsProvider';

import { queryClient } from './queryClient';

interface RequiredProvidersProps {
	children: ReactNode;
}

const RequiredProviders: FC<RequiredProvidersProps> = props => {
	return (
		<QueryClientProvider client={queryClient}>
			<RootThemeProvider>
				<TranslationsProvider>
					<BrowserRouter basename={import.meta.env.BASE_URL}>
						<React.Suspense fallback={null}>{props.children}</React.Suspense>
					</BrowserRouter>
				</TranslationsProvider>
			</RootThemeProvider>
		</QueryClientProvider>
	);
};

export default RequiredProviders;
