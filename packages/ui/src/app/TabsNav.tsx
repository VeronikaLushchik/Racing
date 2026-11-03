/** @format */

import React, { FC } from 'react';
import { NavLink } from 'react-router-dom';

import useTranslation from '~@engines/translations/useTranslation';

import { appUrl } from 'src/constants/apiConstants';

import { TPage } from 'src/typings';

import classes from './layout.module.scss';

interface TabsNavProps {
	page: TPage;
}

const TabsNav: FC<TabsNavProps> = props => {
	const { page } = props;

	const t = useTranslation();

	return (
		<nav
			className={classes.tabs}
			aria-label={t(page.tKey)}
		>
			{Object.entries(page.tabs ?? {}).map(([key, tab]) => (
				<NavLink
					key={key}
					to={appUrl(`${page.path}${tab.path}`)}
					className={classes.tab}
					activeClassName={classes.tabActive}
				>
					{t(tab.tKey)}
				</NavLink>
			))}
		</nav>
	);
};

export default TabsNav;
