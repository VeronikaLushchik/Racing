/** @format */

import React, { FC } from 'react';
import { NavLink } from 'react-router-dom';

import useTranslation from '~@engines/translations/useTranslation';

import { appUrl } from '../../../constants/apiConstants';

import { TPage } from '../../../typings';

import classes from './tabsContent.module.scss';

interface TabsContentProps {
	page: TPage;
}

const TabsContent: FC<TabsContentProps> = props => {
	const { page } = props;

	const t = useTranslation();

	return (
		<nav
			className={classes.tabs_content}
			aria-label={t(page.tKey)}
		>
			{Object.entries(page.tabs ?? {}).map(([key, tab]) => (
				<NavLink
					key={key}
					to={appUrl(`${page.path}${tab.path}`)}
					className={classes.tab_link}
					activeClassName={classes.tab_link_active}
				>
					{t(tab.tKey)}
				</NavLink>
			))}
		</nav>
	);
};

export default TabsContent;
