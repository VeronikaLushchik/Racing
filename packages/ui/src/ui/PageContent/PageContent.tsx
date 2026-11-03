/** @format */

import React, { FC, ReactNode } from 'react';

import classes from './pageContent.module.scss';

interface PageContentProps {
	children: ReactNode;
}

const PageContent: FC<PageContentProps> = props => {
	const { children } = props;

	return <main className={classes.root}>{children}</main>;
};

export default PageContent;
