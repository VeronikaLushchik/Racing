/** @format */

import React, { FC } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

import PageContent from '~@ui/PageContent/PageContent';
import TabsNav from './TabsNav';

import { appUrl } from 'src/constants/apiConstants';
import { pagesConfig } from 'src/constants/pagesConfig';

const Pages: FC = () => (
	<Switch>
		{Object.entries(pagesConfig).map(([key, page]) => {
			if (page.Component) {
				return (
					<Route
						key={key}
						path={appUrl(page.path)}
						component={page.Component}
					/>
				);
			}
			const tabs = Object.entries(page.tabs ?? {});
			return (
				<Route
					key={key}
					path={appUrl(page.path)}
				>
					<TabsNav page={page} />
					<PageContent>
						<Switch>
							{tabs.map(([tabKey, tab]) => (
								<Route
									key={tabKey}
									path={appUrl(`${page.path}${tab.path}`)}
									component={tab.Component}
								/>
							))}
							{tabs[0] && <Redirect to={appUrl(`${page.path}${tabs[0][1].path}`)} />}
						</Switch>
					</PageContent>
				</Route>
			);
		})}
		<Redirect to={appUrl(pagesConfig.source.path)} />
	</Switch>
);

export default Pages;
