import React, { FC, useMemo } from 'react';
import { NavLink } from 'react-router-dom';

import SegmentedToggle from '~@ui/SegmentedToggle/SegmentedToggle';
import StatusPill from './StatusPill';

import useTranslation, { useLanguage } from '~@engines/translations/useTranslation';

import { appUrl } from '../../../constants/apiConstants';
import { pagesConfig } from '../../../constants/pagesConfig';

import { TLanguage } from '~@engines/translations/translationsTypings';
import { TOption } from '../../../typings';

import classes from './header.module.scss';

interface HeaderProps {
	titleContent: React.ReactNode;
}

const Header: FC<HeaderProps> = props => {
	const { titleContent } = props;

	const t = useTranslation();
	const { language, setLanguage } = useLanguage();

	const languageOptions = useMemo<TOption<TLanguage>[]>(
		() => [
			{ value: 'en', label: 'EN' },
			{ value: 'uk', label: 'UK' },
		],
		[],
	);

	return (
		<header className={classes.header}>
			<div className={classes.start_side}>
				{titleContent}
				<nav className={classes.nav}>
					{Object.entries(pagesConfig).map(([key, page]) => (
						<NavLink
							key={key}
							to={appUrl(page.path)}
							className={classes.nav_link}
							activeClassName={classes.nav_link_active}
						>
							{t(page.tKey)}
						</NavLink>
					))}
				</nav>
			</div>
			<StatusPill />
			<SegmentedToggle
				value={language}
				options={languageOptions}
				onSet={setLanguage}
				ariaLabel={t('header.language')}
			/>
		</header>
	);
};

export default Header;
