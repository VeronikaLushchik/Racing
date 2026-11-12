import React, { FC } from 'react';

import Header from './Header/Header';
import SessionEndBanner from 'src/modules/sessionReport/SessionEndBanner';

import classes from './layout.module.scss';

interface LayoutProps {
	title: string;
	children?: React.ReactNode;
}

const Layout: FC<LayoutProps> = props => {
	const { title, children } = props;

	return (
		<div className={classes.layout}>
			<Header titleContent={<span className={classes.page_label}>{title}</span>} />
			<SessionEndBanner />
			<main className={classes.main_content}>{children}</main>
		</div>
	);
};

export default Layout;
