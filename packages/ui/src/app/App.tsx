/** @format */

import React, { FC } from 'react';

import Layout from './Layout';
import OptionalProviders from './OptionalProviders';
import Pages from './Pages';

const App: FC = () => (
	<OptionalProviders>
		<Layout>
			<Pages />
		</Layout>
	</OptionalProviders>
);

export default App;
