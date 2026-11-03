import React, { FC } from 'react';

import { compositeClassNames } from '../../services/functions';

import classes from './pageContent.module.scss';

interface PageContentProps {
	gap?: number | string;
	className?: string;
	style?: React.CSSProperties;
	children: React.ReactNode;
	innerRef?: React.Ref<HTMLDivElement>;
}

const PageContent: FC<PageContentProps> = props => {
	const { children, className: providedClassName, gap, style, innerRef } = props;

	return (
		<div
			className={compositeClassNames(classes.page_content, providedClassName)}
			style={{ gap, ...style }}
			data-page-content="true"
			data-has-gap={gap !== undefined}
			ref={innerRef}
		>
			{children}
		</div>
	);
};

export default PageContent;
