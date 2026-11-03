/** @format */

import React, { FC, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import StatusPill from './StatusPill';

import useTranslation, { useLanguage } from '~@engines/translations/useTranslation';

import { appUrl } from 'src/constants/apiConstants';
import { pagesConfig } from 'src/constants/pagesConfig';

import { TLanguage } from '~@engines/translations/translationsTypings';

import classes from './layout.module.scss';

interface LayoutProps {
	children: ReactNode;
}

const Layout: FC<LayoutProps> = props => {
	const { children } = props;

	const t = useTranslation();
	const { language, setLanguage } = useLanguage();

	return (
		<div className={classes.root}>
			<header className={classes.header}>
				<span className={classes.brand}>Race Telemetry</span>
				<nav className={classes.nav}>
					{Object.entries(pagesConfig).map(([key, page]) => (
						<NavLink
							key={key}
							to={appUrl(page.path)}
							className={classes.navLink}
							activeClassName={classes.navLinkActive}
						>
							{t(page.tKey)}
						</NavLink>
					))}
				</nav>
				<StatusPill />
				<select
					className={classes.language}
					aria-label={t('header.language')}
					value={language}
					onChange={event => setLanguage(event.target.value as TLanguage)}
				>
					<option value="en">EN</option>
					<option value="uk">UK</option>
				</select>
			</header>
			{children}
		</div>
	);
};

export default Layout;
