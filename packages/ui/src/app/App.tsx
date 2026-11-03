import React, { FC } from 'react';

import Layout from './Layout/Layout';
import OptionalProviders from './OptionalProviders';
import Pages from './Pages';

import { APP_TITLE } from '../constants/commonConstants';

const App: FC = () => (
	<OptionalProviders>
		<Layout title={APP_TITLE}>
			<Pages />
		</Layout>
	</OptionalProviders>
);

export default App;
